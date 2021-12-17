import {ToolboxTransformer} from "entrypoint"
import type * as Tsc from "typescript"

// in this file some tricks about interacting with typescript compiler are collected
// some of them contains valuable unobvious knowledge

// source on some functions and code here: https://github.com/xialvjun/ts-sql-plugin/blob/master/lib/create.ts
export function makeDiagnostic(src: ToolboxTransformer.DiagnosticSourceData): Tsc.Diagnostic {
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

/** Does this type explicitly conform to named marker interface/class?
 * Explicit conformity = this type is this interface, or something that extends this interface
 * (opposed to implicit conformity, when type just shaped the same way without mentioning the interface)
 * Note that this function is only checks for interface names, not interface themselves
 * Also note that types like (SomethingWrong | MY_MARKER_INTERFACE) will return true on this check
 * Returns deepest interface/class type that has marker */
export function typeHasMarker(tsc: typeof Tsc, typechecker: Tsc.TypeChecker, type: Tsc.Type, markerName: string): Tsc.InterfaceType | null {
	if(type.isUnionOrIntersection()){ // (A | B), or (A & B)

		for(let subtype of type.types){
			let res = typeHasMarker(tsc, typechecker, subtype, markerName)
			if(res){
				return res
			}
		}

	} else if(type.isClassOrInterface()){

		for(let decl of type.getSymbol()?.getDeclarations() || []){
			if(declarationExtendsMarker(tsc, typechecker, decl, markerName)){
				return type
			}
		}

	}

	return null
}

/** Is this type a class or interface that extends marker interface/class? */
export function typeIsClasslikeExtendingMarker(tsc: typeof Tsc, typechecker: Tsc.TypeChecker, type: Tsc.Type, markerName: string):
boolean {
	if(type.isUnionOrIntersection()){

		for(let subtype of type.types){
			if(typeIsClasslikeExtendingMarker(tsc, typechecker, subtype, markerName)){
				return true
			}
		}
	} else {
		for(let decl of type.getSymbol()?.getDeclarations() || []){
			if(declarationExtendsMarker(tsc, typechecker, decl, markerName)){
				return true
			}
		}
	}

	return false
}

/** Does this interface/class declaration, or any of its ancestors, explicitly extends marker interface/class?
 * See typeHasMarker() comments for further explanations */
export function declarationExtendsMarker(tsc: typeof Tsc, typechecker: Tsc.TypeChecker, decl: Tsc.Declaration, markerName: string): boolean {
	// more types of declarations here..?
	if(!tsc.isInterfaceDeclaration(decl) && !tsc.isClassDeclaration(decl)){
		return false
	}

	let name = decl.name
	if(name && name.text === markerName){
		return true
	}

	for(let heritage of decl.heritageClauses || []){ // extends + implements - more than one clause
		for(let heritageExpression of heritage.types){ // each type of clause, if there is list of them: extends A, B
			let heritageType = typechecker.getTypeAtLocation(heritageExpression)
			if(typeIsClasslikeExtendingMarker(tsc, typechecker, heritageType, markerName)){
				return true
			}
		}
	}

	return false

}

function nodeHasModifier(node: Tsc.Node, keyword: Tsc.SyntaxKind): boolean {
	return !!node.modifiers && !!node.modifiers.find(mod => mod.kind === keyword)
}

/** Does this node has export keyword? */
export function isNodeExported(tsc: typeof Tsc, node: Tsc.Node): boolean {
	return nodeHasModifier(node, tsc.SyntaxKind.ExportKeyword)
}

/** Does this node has abstract keyword? */
export function isNodeAbstract(tsc: typeof Tsc, node: Tsc.Node): boolean {
	return nodeHasModifier(node, tsc.SyntaxKind.AbstractKeyword)
}

export function findNodeChildrenOfType<T extends Tsc.Node>(node: Tsc.Node, checker: (node: Tsc.Node) => node is T, onNodeFound: (node: T) => void): void {
	node.forEachChild(node => {
		if(checker(node)){
			onNodeFound(node)
		} else {
			findNodeChildrenOfType(node, checker, onNodeFound)
		}
	})
}

export function printFileWithTransformer(tsc: typeof Tsc, file: Tsc.SourceFile, context: Tsc.TransformationContext): void {
	console.error("Visiting file " + file.fileName)

	function visitor(node: Tsc.Node, depth: number): Tsc.VisitResult<Tsc.Node> {
		console.error(new Array(depth + 1).join("\t") + (!node ? node + "" : tsc.SyntaxKind[node.kind]))
		return tsc.visitEachChild(node, node => visitor(node, depth + 1), context)
	}

	tsc.visitEachChild(file, node => visitor(node, 0), context)
}

/** Having some value, make expression creating this value
 * Will probably fail on anything barely complex
 * (that is, no prototypes, functions, symbols, getters/setters, bigints...) */
export function createLiteralOfValue(tsc: typeof Tsc, value: unknown): Tsc.Expression {
	switch (typeof(value)){
		case "undefined": return tsc.factory.createVoidZero()
		case "string": return tsc.factory.createStringLiteral(value)
		case "number": return tsc.factory.createNumericLiteral(value)
		case "boolean": return value ? tsc.factory.createTrue() : tsc.factory.createFalse()
		case "object":
			if(value === null){
				return tsc.factory.createNull()
			}

			if(Array.isArray(value)){
				return tsc.factory.createArrayLiteralExpression(
					value.map(item => createLiteralOfValue(tsc, item))
				)
			}

			return tsc.factory.createObjectLiteralExpression(
				(Object.keys(value) as (keyof(typeof value))[]).map(propName => {
					let propValue = value[propName]
					return tsc.factory.createPropertyAssignment(propName, createLiteralOfValue(tsc, propValue))
				})
			)

		default: throw new Error("Cannot create literal of type " + typeof(value))
	}
}