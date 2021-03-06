import {ToolboxTransformer} from "entrypoint"
import type * as Tsc from "typescript"

const generatedFileCommentPrefix = "/* This file is autogenerated. Your direct changes will be lost. */\n\n"

// source on some functions and code here: https://github.com/xialvjun/ts-sql-plugin/blob/master/lib/create.ts

/** A collection of tricks related to dealing with Typescript's AST. */
export class TscAstTricks {

	// To require typescript library separately is important
	// because when we write language service plugin, we MUST use externally provided typescript version
	constructor(readonly tsc: typeof Tsc) {}

	makeDiagnostic(src: ToolboxTransformer.DiagnosticSourceData): Tsc.Diagnostic {
		return {
			file: src.sourceFile,
			start: !src.node ? undefined : src.node.getStart(),
			length: !src.node ? undefined : src.node.getEnd() - src.node.getStart(),
			source: src.source,
			code: typeof(src.code) === "number" ? src.code : 1,
			category: src.category,
			messageText: src.messageText
		}
	}

	/** Does this node has export keyword? */
	isNodeExported(node: Tsc.Node): boolean {
		return this.nodeHasModifier(node, this.tsc.SyntaxKind.ExportKeyword)
	}

	/** Does this node has abstract keyword? */
	isNodeAbstract(node: Tsc.Node): boolean {
		return this.nodeHasModifier(node, this.tsc.SyntaxKind.AbstractKeyword)
	}

	nodeHasModifier(node: Tsc.Node, keyword: Tsc.SyntaxKind): boolean {
		return !!node.modifiers && !!node.modifiers.find(mod => mod.kind === keyword)
	}

	/** Having some value, make expression creating this value
	 * Will probably fail on anything barely complex
	 * (that is, no prototypes, functions, symbols, getters/setters, bigints...) */
	createLiteralOfValue(value: unknown): Tsc.Expression {
		switch(typeof(value)){
			case "undefined": return this.tsc.factory.createVoidZero()
			case "string": return this.tsc.factory.createStringLiteral(value)
			case "number": return this.tsc.factory.createNumericLiteral(value)
			case "boolean": return value ? this.tsc.factory.createTrue() : this.tsc.factory.createFalse()
			case "object":{
				if(value === null){
					return this.tsc.factory.createNull()
				}

				if(Array.isArray(value)){
					return this.tsc.factory.createArrayLiteralExpression(
						value.map(item => this.createLiteralOfValue(item))
					)
				}

				if(value instanceof Set){
					let valExprs = [] as Tsc.Expression[]
					for(let val of value.values()){
						valExprs.push(this.createLiteralOfValue(val))
					}
					return this.tsc.factory.createNewExpression(
						this.tsc.factory.createIdentifier("Set"),
						undefined,
						[this.tsc.factory.createArrayLiteralExpression(valExprs, false)]
					)
				}

				if(value instanceof Map){
					let valExprs = [] as Tsc.Expression[]
					for(let [k, v] of value.entries()){
						valExprs.push(this.tsc.factory.createArrayLiteralExpression([
							this.createLiteralOfValue(k),
							this.createLiteralOfValue(v)
						]))
					}
					return this.tsc.factory.createNewExpression(
						this.tsc.factory.createIdentifier("Map"),
						undefined,
						[this.tsc.factory.createArrayLiteralExpression(valExprs, false)]
					)
				}

				return this.tsc.factory.createObjectLiteralExpression(
					(Object.keys(value) as (string)[]).map(propName => {
						let propValue = value[propName as keyof typeof value]

						let nameNode: Tsc.PropertyName
						if(propName.match(/^[a-zA-Z_\d]+$/)){
							nameNode = this.tsc.factory.createIdentifier(propName)
						} else {
							nameNode = this.tsc.factory.createStringLiteral(propName)
						}

						return this.tsc.factory.createPropertyAssignment(
							nameNode,
							this.createLiteralOfValue(propValue)
						)
					})
				)
			}
			default: throw new Error("Cannot create literal of type " + typeof(value))
		}
	}

	/** Having an entity name (that is essentialy a sequence of identifiers), extract those identifiers into array */
	entityNameToArray(expr: Tsc.EntityName): string[] {
		let result = [] as string[]

		for(;;){
			if(this.tsc.isIdentifier(expr)){
				result.push(expr.text)
				break
			} else if(this.tsc.isQualifiedName(expr)){
				result.push(expr.right.text)
				expr = expr.left
			} else {
				throw new Error("Expected following expression to be property access expression, or identifier, but it's neither: " + expr)
			}
		}

		return result.reverse()
	}

	/** Having a sequence of identifiers, convert it to property chain expression */
	arrayToPropertyAccessChain(arr: string[]): Tsc.Expression {
		let result: Tsc.Expression = this.tsc.factory.createIdentifier(arr[0])
		for(let i = 1; i < arr.length; i++){
			result = this.tsc.factory.createPropertyAccessExpression(result, arr[i])
		}
		return result
	}

	/** Having variable statement, extract all the identifiers of the variables this statement declares
 	 * Accounts for multiple variables and destructuring */
	getIdentifiersFromVariableDeclarations(varstat: Tsc.VariableStatement): Tsc.Identifier[] {
		let result: Tsc.Identifier[] = []

		let processName = (name: Tsc.BindingName): void => {
			if(this.tsc.isIdentifier(name)){
				result.push(name)
			} else if(this.tsc.isArrayBindingPattern(name) || this.tsc.isObjectBindingPattern(name)){
				for(let el of name.elements){
					if(this.tsc.isBindingElement(el)){
						processName(el.name)
					}
				}
			}
		}

		for(let decl of varstat.declarationList.declarations){
			processName(decl.name)
		}

		return result
	}

	writeGeneratedFile(path: string, text: string): void {
		this.tsc.sys.writeFile(path, generatedFileCommentPrefix + text)
	}

}