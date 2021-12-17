import {SubTransformer, SubTransformerTransformParams} from "main_transformer"
import {PseudomethodTaskDef} from "transformer_config"
import * as Tsc from "typescript"

interface ModuleImportStructure {
	/** Map of names of modules (imported name -> module name) that are imported as `import * as X from "X";` */
	moduleObjects: Map<string, string>
	/** Map of values (value name -> module name) that are imported as `import {x, y} from "Z";` */
	namedImports: Map<string, string>
}

export class PseudomethodsTransformer implements SubTransformer {

	private markers: Set<string>

	constructor(tasks: PseudomethodTaskDef[]) {
		this.markers = new Set(tasks.map(x => x.markerName))
	}

	toString(): string {
		return "Pseudomethods"
	}

	onModuleDelete(): void {
		// nothing. could clear import cache here, but module name does not converts to filename nicely
	}

	transform(params: SubTransformerTransformParams): Tsc.SourceFile {
		this.clearCacheForTypeSourceFile(params.file)
		// we won't rebuild the cache immediately after dropping. it will happen lazily on first transform

		// module name (as in path) -> module imported identifier name
		let moduleNames = new Map<string, string>()

		let visitor = (node: Tsc.Node): Tsc.VisitResult<Tsc.Node> => {
			if(Tsc.isCallExpression(node) && Tsc.isPropertyAccessExpression(node.expression)){
				let pseudomethodCallData = this.getSymbolOfPseudomethodDefinition(node, params)
				if(pseudomethodCallData){
					let {moduleName, referenceExpressionTail} = this.getImportsForPseudomethodSymbol(
						pseudomethodCallData.symbol,
						pseudomethodCallData.methodEntityName,
						params
					)

					let unicalizedModuleName = moduleNames.get(moduleName)
					if(!unicalizedModuleName){
						unicalizedModuleName = "pseudomethods_" + Math.floor(Math.random() * 0xffffffff)
						moduleNames.set(moduleName, unicalizedModuleName)
					}

					let fullReferenceExpressionArr = [unicalizedModuleName, ...referenceExpressionTail, "call"]
					let expr = this.arrayToPropertyAccessChain(fullReferenceExpressionArr)
					node = Tsc.factory.createCallExpression(
						expr,
						node.typeArguments,
						[
							node.expression.expression,
							...node.arguments
						]
					)
				}
			}

			node = Tsc.visitEachChild(node, visitor, params.transformContext)

			return node
		}

		let result = Tsc.visitEachChild(params.file, visitor, params.transformContext)

		result = this.addImports(result, moduleNames)

		return result
	}

	/** Prepend new import declarations into module file */
	private addImports(file: Tsc.SourceFile, moduleNames: Map<string, string>): Tsc.SourceFile {
		if(moduleNames.size < 1){
			return file
		}
		let imports = [] as Tsc.ImportDeclaration[]
		moduleNames.forEach((importedName, pathName) => {
			imports.push(Tsc.factory.createImportDeclaration(
				undefined,
				undefined,
				Tsc.factory.createImportClause(false, undefined, Tsc.factory.createNamespaceImport(
					Tsc.factory.createIdentifier(importedName)
				)),
				Tsc.factory.createStringLiteral(pathName)
			))
		})

		return Tsc.factory.updateSourceFile(file, [
			...imports,
			...file.statements
		])
	}

	/** Check if this node is call expression of pseudomodule, and return related info if so
	 * It's kinda ugly, but I just felt the urge to refactor this piece of code into separate method */
	private getSymbolOfPseudomethodDefinition(callNode: Tsc.CallExpression, params: SubTransformerTransformParams): {symbol: Tsc.Symbol, methodEntityName: Tsc.EntityName} | null {
		let symbol = params.typechecker.getSymbolAtLocation(callNode.expression)
		if(!symbol || !symbol.valueDeclaration || (!Tsc.isPropertyDeclaration(symbol.valueDeclaration) && !Tsc.isPropertySignature(symbol.valueDeclaration))){
			return null
		}

		let declType = symbol.valueDeclaration.type
		if(!declType || !Tsc.isTypeReferenceNode(declType)){
			return null
		}

		let methodTypeName = declType.typeName.getText()
		if(!this.markers.has(methodTypeName)){
			return null
		}

		let typeArgs = declType.typeArguments
		if(!typeArgs || typeArgs.length !== 1 || !Tsc.isTypeQueryNode(typeArgs[0])){
			return null
		}

		let typeQuery = typeArgs[0]
		return {
			symbol: symbol, methodEntityName: typeQuery.exprName
		}
	}

	private moduleImportCache = new Map<string, ModuleImportStructure>()
	/** Caching proxy method for parseImports() */
	private getImportStructureFor(file: Tsc.SourceFile, params: SubTransformerTransformParams): ModuleImportStructure {
		let key = file.fileName
		let cached = this.moduleImportCache.get(key)
		if(cached){
			return cached
		}

		let result = this.parseImports(file, params)
		this.moduleImportCache.set(key, result)
		return result
	}

	/** If the file is pseudomethods typedef file, drop the cache */
	private clearCacheForTypeSourceFile(file: Tsc.SourceFile): void {
		let key = file.fileName
		if(this.moduleImportCache.has(key)){
			this.moduleImportCache.delete(key)
		}
	}

	/** Having an entity name (that is essentialy a sequence of identifiers), extract those identifiers to array */
	private entityNameToArray(expr: Tsc.EntityName): string[] {
		let result = [] as string[]

		for(;;){
			if(Tsc.isIdentifier(expr)){
				result.push(expr.text)
				break
			} else if(Tsc.isQualifiedName(expr)){
				result.push(expr.right.text)
				expr = expr.left
			} else {
				throw new Error("Expected following expression to be property access expression, or identifier, but it's neither: " + expr)
			}
		}

		return result.reverse()
	}

	/** Having a sequence of identifiers, convert it to property chain expression */
	private arrayToPropertyAccessChain(arr: string[]): Tsc.Expression {
		let result: Tsc.Expression = Tsc.factory.createIdentifier(arr[0])
		for(let i = 1; i < arr.length; i++){
			result = Tsc.factory.createPropertyAccessExpression(result, arr[i])
		}
		return result
	}

	/** Having pseudomethod definition symbol, deduce how to reference actual function in import */
	private getImportsForPseudomethodSymbol(symbol: Tsc.Symbol, importedExpression: Tsc.EntityName, params: SubTransformerTransformParams): {moduleName: string, referenceExpressionTail: string[]} {
		let decls = symbol.getDeclarations()
		if(!decls || decls.length === 0){
			// should never happen
			throw new Error("Following symbol has no declarations (but expected to have at least one): " + symbol.getEscapedName())
		}

		let chainIdentifiers = this.entityNameToArray(importedExpression)

		for(let decl of decls){
			let sourceFile = decl.getSourceFile()
			let imports = this.getImportStructureFor(sourceFile, params)

			{
				let moduleName = imports.moduleObjects.get(chainIdentifiers[0])
				if(moduleName){
					return {moduleName, referenceExpressionTail: chainIdentifiers.slice(1)}
				}
			}

			{
				let moduleName = imports.namedImports.get(chainIdentifiers[0])
				if(moduleName){
					return {moduleName, referenceExpressionTail: chainIdentifiers}
				}
			}
		}

		// should never happen
		throw new Error("Could not detect an import that matches pseudomethod reference: " + symbol.getEscapedName())
	}

	/** Convert imports of source file to simplier structure */
	private parseImports(file: Tsc.SourceFile, params: SubTransformerTransformParams): ModuleImportStructure {
		let namedImports = new Map<string, string>()
		let moduleObjects = new Map<string, string>()

		let visitor = (node: Tsc.Node): Tsc.VisitResult<Tsc.Node> => {
			if(Tsc.isImportDeclaration(node) && Tsc.isStringLiteral(node.moduleSpecifier) && node.importClause && node.importClause.namedBindings){
				let moduleName = node.moduleSpecifier.text
				if(Tsc.isNamespaceImport(node.importClause.namedBindings)){
					moduleObjects.set(node.importClause.namedBindings.name.text, moduleName)
				} else if(Tsc.isNamedImports(node.importClause.namedBindings)){
					for(let el of node.importClause.namedBindings.elements){
						namedImports.set(el.name.text, moduleName)
					}
				}
			} else {
				Tsc.visitEachChild(node, visitor, params.transformContext)
			}
			return node
		}

		Tsc.visitEachChild(file, visitor, params.transformContext)

		return {moduleObjects, namedImports}
	}

}