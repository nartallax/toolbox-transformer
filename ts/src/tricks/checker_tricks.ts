import {TscAstTricks} from "tricks/ast_tricks"
import type * as Tsc from "typescript"

/** A collection of tricks related to dealing with typescript type system */
export class TscCheckerTricks extends TscAstTricks {

	constructor(tsc: typeof Tsc, readonly checker: Tsc.TypeChecker) {
		super(tsc)
	}

	/** Does this type explicitly conform to named marker interface/class?
	 * Explicit conformity = this type is this interface, or something that extends this interface
	 * (opposed to implicit conformity, when type just shaped the same way without mentioning the interface)
	 * Note that this function is only checks for interface names, not interface themselves
	 * Also note that types like (SomethingWrong | MY_MARKER_INTERFACE) will return true on this check
	 * Returns deepest interface/class type that has marker */
	typeHasMarker(type: Tsc.Type, markerName: string): Tsc.InterfaceType | null {
		if(type.isUnionOrIntersection()){ // (A | B), or (A & B)

			for(let subtype of type.types){
				let res = this.typeHasMarker(subtype, markerName)
				if(res){
					return res
				}
			}

		} else if(type.isClassOrInterface()){

			for(let decl of type.getSymbol()?.getDeclarations() || []){
				if(this.declarationExtendsMarker(decl, markerName)){
					return type
				}
			}

		}

		return null
	}

	/** Is this type a class or interface that extends marker interface/class? */
	typeIsClasslikeExtendingMarker(type: Tsc.Type, markerName: string):
	boolean {
		if(type.isUnionOrIntersection()){

			for(let subtype of type.types){
				if(this.typeIsClasslikeExtendingMarker(subtype, markerName)){
					return true
				}
			}
		} else {
			for(let decl of type.getSymbol()?.getDeclarations() || []){
				if(this.declarationExtendsMarker(decl, markerName)){
					return true
				}
			}
		}

		return false
	}

	/** Does this interface/class declaration, or any of its ancestors, explicitly extends marker interface/class?
 	* See typeHasMarker() comments for further explanations */
	declarationExtendsMarker(decl: Tsc.Declaration, markerName: string): boolean {
		// more types of declarations here..?
		if(!this.tsc.isInterfaceDeclaration(decl) && !this.tsc.isClassDeclaration(decl)){
			return false
		}

		let name = decl.name
		if(name && name.text === markerName){
			return true
		}

		for(let heritage of decl.heritageClauses || []){ // extends + implements - more than one clause
			for(let heritageExpression of heritage.types){ // each type of clause, if there is list of them: extends A, B
				let heritageType = this.checker.getTypeAtLocation(heritageExpression)
				if(this.typeIsClasslikeExtendingMarker(heritageType, markerName)){
					return true
				}
			}
		}

		return false

	}

}