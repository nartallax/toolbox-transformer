import {ToolboxTransformer} from "entrypoint"
import {generatedFileCommentPrefix, SubTransformerTransformParams} from "main_transformer"
import {ToolboxTransformerConfig} from "transformer_config"
import {entityNameToArray, isNodeExported} from "tsc_tricks"
import * as Tsc from "typescript"

// logical continuation of tsc_tricks
// utilities for transformers basically

/** Complete reference to some exported value */
export interface ExportedValueReference {
	/** Name of module that has the value */
	moduleName: string
	/** Chain of identifiers inside the module export that leads to the value */
	identifiers: string[]
}

/** Having symbol that refers to variable, get exported value reference
 * @returns value reference or null, if this value is not exported */
export function getVariableReferenceByName(params: SubTransformerTransformParams, name: Tsc.EntityName): ExportedValueReference | null {
	let symbol = params.typechecker.getSymbolAtLocation(name)
	if(!symbol){
		throw new Error("Identifier " + name.getText() + " has no symbols!")
	}

	let valueDecl: Tsc.VariableDeclaration | Tsc.BindingElement | Tsc.ImportSpecifier | Tsc.NamespaceImport | null = null
	if(symbol.declarations){
		for(let decl of symbol.declarations){
			if(Tsc.isVariableDeclaration(decl) || (Tsc.isBindingElement(decl) && Tsc.isIdentifier(decl.name)) || Tsc.isImportSpecifier(decl) || Tsc.isNamespaceImport(decl)){
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

	if(Tsc.isImportSpecifier(valueDecl) || Tsc.isNamespaceImport(valueDecl)){
		// value is imported
		let importDecl = Tsc.isImportSpecifier(valueDecl)
			? valueDecl.parent.parent.parent
			: valueDecl.parent.parent
		moduleName = params.modulePathResolver.resolveModuleDesignator(
			(importDecl.moduleSpecifier as Tsc.StringLiteral).text,
			valueDecl.getSourceFile().fileName
		)

		let nameParts = entityNameToArray(Tsc, name)
		if(Tsc.isImportSpecifier(valueDecl)){
			let origName = (valueDecl.propertyName || valueDecl.name).getText()
			path = [origName, ...nameParts.slice(1)]
		} else {
			path = nameParts.slice(1)
		}
	} else {
		// if the value is not imported - it is within the module that references it
		path = [valueDecl.name.getText()]

		let node: Tsc.Node = valueDecl.parent
		while(node && !Tsc.isSourceFile(node)){
			if(Tsc.isObjectBindingPattern(node) || Tsc.isArrayBindingPattern(node) || Tsc.isBindingElement(node) || Tsc.isVariableDeclaration(node) || Tsc.isVariableDeclarationList(node) || Tsc.isModuleBlock(node)){
			// skipping non-important nesting
			// it won't affect name path nesting or anything really
			} else if(Tsc.isVariableStatement(node)){
				if(!isNodeExported(Tsc, node)){
					return null
				}
			} else if(Tsc.isModuleDeclaration(node)){ // namespaces
				if(!isNodeExported(Tsc, node)){
					return null
				}
				path.push(node.name.getText())
			}
			node = node.parent
		}
		if(!node || !Tsc.isSourceFile(node)){
			return null
		} else {
			moduleName = params.modulePathResolver.getCanonicalModuleName(node.fileName)
			path = path.reverse()
		}
	}

	return {
		moduleName,
		identifiers: path
	}
}

export function writeGeneratedFile(context: ToolboxTransformer.TransformerProjectContext<ToolboxTransformerConfig>, path: string, text: string): void {
	Tsc.sys.writeFile(path, generatedFileCommentPrefix + text)

	if(context.imploder){
		context.imploder.compiler.notifyFsObjectChange(path)
	}
}