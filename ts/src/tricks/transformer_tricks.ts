import {TscCheckerTricks} from "tricks/checker_tricks"
import type * as Tsc from "typescript"

export interface ModuleImportStructure {
	/** Map of names of modules (imported name -> module name) that are imported as `import * as X from "X";` */
	readonly moduleObjects: ReadonlyMap<string, string>
	/** Map of values (value name -> module name) that are imported as `import {x, y} from "Z";` */
	readonly namedImports: ReadonlyMap<string, string>
}

/** A collection of tricks related to working with AST for a transformer */
export class TscTransformerTricks extends TscCheckerTricks {
	constructor(
		tsc: typeof Tsc,
		checker: Tsc.TypeChecker,
		readonly transformContext: Tsc.TransformationContext) {
		super(tsc, checker)
	}

	printFileWithTransformer(file: Tsc.SourceFile): void {
		console.error("Visiting file " + file.fileName)

		let visitor: (node: Tsc.Node, depth: number) => Tsc.VisitResult<Tsc.Node> = (node, depth) => {
			console.error(new Array(depth + 1).join("\t") + (!node ? node + "" : this.tsc.SyntaxKind[node.kind]))
			return this.tsc.visitEachChild(node, node => visitor(node, depth + 1), this.transformContext)
		}

		this.tsc.visitEachChild(file, node => visitor(node, 0), this.transformContext)
	}

	/** Convert imports of source file to simplier structure */
	parseModuleFileImports(file: Tsc.SourceFile): ModuleImportStructure {
		let namedImports = new Map<string, string>()
		let moduleObjects = new Map<string, string>()

		let visitor = (node: Tsc.Node): Tsc.VisitResult<Tsc.Node> => {
			if(this.tsc.isImportDeclaration(node) && this.tsc.isStringLiteral(node.moduleSpecifier) && node.importClause && node.importClause.namedBindings){
				let moduleName = node.moduleSpecifier.text
				if(this.tsc.isNamespaceImport(node.importClause.namedBindings)){
					moduleObjects.set(node.importClause.namedBindings.name.text, moduleName)
				} else if(this.tsc.isNamedImports(node.importClause.namedBindings)){
					for(let el of node.importClause.namedBindings.elements){
						namedImports.set(el.name.text, moduleName)
					}
				}
			} else {
				this.tsc.visitEachChild(node, visitor, this.transformContext)
			}
			return node
		}

		this.tsc.visitEachChild(file, visitor, this.transformContext)

		return {moduleObjects, namedImports}
	}

}