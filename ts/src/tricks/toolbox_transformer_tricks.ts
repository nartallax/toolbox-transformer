import {ToolboxTransformer} from "entrypoint"
import {ModulePathResolver, ModulePathResolverImpl} from "module_path_resolver"
import {TscTransformerTricks} from "tricks/transformer_tricks"
import type * as Tsc from "typescript"

/** Complete reference to some node */
export interface NodeReference {
	/** Name of module that has the value */
	moduleName: string
	/** Chain of identifiers inside the module export that leads to the value */
	identifiers: string[]
}

/** In this class lies collection of tricks related to transformers
 * Unlike other trick-classes, this class is opinionated
 * That is, there is other ways of doing things described in this class
 * I just personally chose to do them this way */
export class ToolboxTransformerTricks extends TscTransformerTricks {

	// yes, this code copies code from main transformer
	// instance of module path resolver is kinda needed in both of the places
	// and need to be able to be created in both of them
	// no beautiful solution found
	private _modulePathResolver: ModulePathResolver | null = null
	get modulePathResolver(): ModulePathResolver {
		if(this.toolboxContext.imploder){
			return this.toolboxContext.imploder.modulePathResolver
		} else {
			return this._modulePathResolver ||= new ModulePathResolverImpl(
				this.toolboxContext.tsconfigPath,
				this.toolboxContext.program
			)
		}
	}

	constructor(
		readonly toolboxContext: ToolboxTransformer.TransformerProjectContext,
		transformContext: Tsc.TransformationContext,
		tsc: typeof Tsc) {
		super(tsc, toolboxContext.program.getTypeChecker(), transformContext)
	}

	/** Having symbol that refers to variable, get exported value reference
	 * @returns value reference or null, if this value is not exported */
	getVariableReferenceByName(name: Tsc.EntityName): NodeReference | null {
		let symbol = this.checker.getSymbolAtLocation(name)
		if(!symbol){
			throw new Error("Identifier " + name.getText() + " has no symbols!")
		}

		let valueDecl: Tsc.VariableDeclaration | Tsc.BindingElement | Tsc.ImportSpecifier | Tsc.NamespaceImport | null = null
		if(symbol.declarations){
			for(let decl of symbol.declarations){
				if(this.tsc.isVariableDeclaration(decl) || (this.tsc.isBindingElement(decl) && this.tsc.isIdentifier(decl.name)) || this.tsc.isImportSpecifier(decl) || this.tsc.isNamespaceImport(decl)){
					valueDecl = decl
					break
				}
			}
		}
		if(!valueDecl){
			throw new Error("Cannot find good declaration of " + name.getText())
		}

		let moduleName: string
		let path: string[]

		if(this.tsc.isImportSpecifier(valueDecl) || this.tsc.isNamespaceImport(valueDecl)){
		// value is imported
			let importDecl = this.tsc.isImportSpecifier(valueDecl)
				? valueDecl.parent.parent.parent
				: valueDecl.parent.parent
			moduleName = this.modulePathResolver.resolveModuleDesignator(
				(importDecl.moduleSpecifier as Tsc.StringLiteral).text,
				valueDecl.getSourceFile().fileName
			)

			let nameParts = this.entityNameToArray(name)
			if(this.tsc.isImportSpecifier(valueDecl)){
				let origName = (valueDecl.propertyName || valueDecl.name).getText()
				path = [origName, ...nameParts.slice(1)]
			} else {
				path = nameParts.slice(1)
			}
		} else {
		// if the value is not imported - it is within the module that references it
			path = [valueDecl.name.getText()]

			let node: Tsc.Node = valueDecl.parent
			while(node && !this.tsc.isSourceFile(node)){
				if(this.tsc.isObjectBindingPattern(node) || this.tsc.isArrayBindingPattern(node) || this.tsc.isBindingElement(node) || this.tsc.isVariableDeclaration(node) || this.tsc.isVariableDeclarationList(node) || this.tsc.isModuleBlock(node)){
					// skipping non-important nesting
					// it won't affect name path nesting or anything really
				} else if(this.tsc.isVariableStatement(node)){
					if(!this.isNodeExported(node)){
						return null
					}
				} else if(this.tsc.isModuleDeclaration(node)){ // namespaces
					if(!this.isNodeExported(node)){
						return null
					}
					path.push(node.name.getText())
				}
				node = node.parent
			}
			if(!node || !this.tsc.isSourceFile(node)){
				return null
			} else {
				moduleName = this.modulePathResolver.getCanonicalModuleName(node.fileName)
				path = path.reverse()
			}
		}

		return {
			moduleName,
			identifiers: path
		}
	}

	/** Having some node, get full path to the node
	 * Idenitfiers are only supported if they are part of some declaration (i.e. variable declaration)
	 */
	getReferenceToDeclaration(decl: Tsc.InterfaceDeclaration | Tsc.TypeAliasDeclaration | Tsc.ClassDeclaration | Tsc.Identifier): {ref: NodeReference, exported: boolean} {
		let path = [] as string[]
		let exported = this.isNodeExported(decl)
		if("name" in decl && decl.name){
			path.push(decl.name.text)
		} else if(this.tsc.isIdentifier(decl)){
			path.push(decl.text)
		}

		let node: Tsc.Node = decl
		while(node && !this.tsc.isSourceFile(node)){
			if(this.tsc.isModuleBlock(node) || this.tsc.isVariableDeclarationList(node)){
			// skip
			} else if(this.tsc.isVariableStatement(node)){
				exported = exported && this.isNodeExported(node)
			} else if(this.tsc.isVariableDeclaration(node)){
				// if declaration of class is put inside variable
				// the exported name will be not the name of class, but the name of the variable
				if(this.tsc.isIdentifier(node.name)){
					if(path.length > 0){
						path.pop()
					}
					path.push(node.name.text)
				}
			} else if(this.tsc.isModuleDeclaration(node)){ // namespaces
				exported = exported && this.isNodeExported(node)
				path.push(node.name.text)
			}
			node = node.parent
		}
		let moduleName = this.modulePathResolver.getCanonicalModuleName(node.fileName)
		path = path.reverse()
		return {ref: {moduleName, identifiers: path}, exported}
	}

	writeGeneratedFile(path: string, text: string): void {
		super.writeGeneratedFile(path, text)
		if(this.toolboxContext.imploder){
			this.toolboxContext.imploder.compiler.notifyFsObjectChange(path)
		}
	}

	/** Prepend new import declarations into module file
	 * @param moduleNames import path -> identifier of module object within file */
	addModuleObjectImportsToSourceFile(file: Tsc.SourceFile, moduleNames: Map<string, string>): Tsc.SourceFile {
		if(moduleNames.size < 1){
			return file
		}
		let selfModuleName = this.modulePathResolver.getCanonicalModuleName(file.fileName)
		let imports = [] as Tsc.ImportDeclaration[]
		moduleNames.forEach((importedName, pathName) => {
			let canonicalName = this.modulePathResolver.resolveModuleDesignator(pathName, file.fileName)
			if(canonicalName === selfModuleName){
				throw new Error("Cannot add import to module " + selfModuleName + " into itself.")
			}
			imports.push(this.tsc.factory.createImportDeclaration(
				undefined,
				undefined,
				this.tsc.factory.createImportClause(false, undefined, this.tsc.factory.createNamespaceImport(
					this.tsc.factory.createIdentifier(importedName)
				)),
				this.tsc.factory.createStringLiteral(pathName)
			))
		})

		return this.tsc.factory.updateSourceFile(file, [
			...imports,
			...file.statements
		])
	}


}