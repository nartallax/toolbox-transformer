import {SubTransformer, SubTransformerTransformParams} from "main_transformer"
import {PseudomethodTaskDef} from "transformer_config"
import * as Tsc from "typescript"

export class PseudomethodsTransformer extends SubTransformer {

	private markers: Set<string>

	constructor(tasks: PseudomethodTaskDef[]) {
		super()
		this.markers = new Set(tasks.map(x => x.markerName))
	}

	toString(): string {
		return "Pseudomethods"
	}

	onModuleDelete(): void {
		// nothing. could clear import cache here, but module name does not converts to filename nicely
	}

	transform(params: SubTransformerTransformParams): Tsc.SourceFile {
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
					let expr = this.tricks.arrayToPropertyAccessChain(fullReferenceExpressionArr)
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

		result = this.tricks.addModuleObjectImportsToSourceFile(result, moduleNames)

		return result
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

	/** Having pseudomethod definition symbol, deduce how to reference actual function in import */
	private getImportsForPseudomethodSymbol(symbol: Tsc.Symbol, importedExpression: Tsc.EntityName, params: SubTransformerTransformParams): {moduleName: string, referenceExpressionTail: string[]} {
		/*
		This method kinda sucks
		Much better way will be to use symbol to deduce its location, and not rely on import wording of the original file (see getVariableReferenceBySymbol() and typeof_type_map.ts)
		Maybe I'll rewrite it some day
		*/
		let decls = symbol.getDeclarations()
		if(!decls || decls.length === 0){
			// should never happen
			throw new Error("Following symbol has no declarations (but expected to have at least one): " + symbol.getEscapedName())
		}

		let chainIdentifiers = this.tricks.entityNameToArray(importedExpression)

		for(let decl of decls){
			let sourceFile = decl.getSourceFile()
			let imports = params.getImportsFor(sourceFile)

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

}