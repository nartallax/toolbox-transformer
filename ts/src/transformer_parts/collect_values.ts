import {ToolboxTransformer} from "entrypoint"
import {generatedFileCommentPrefix, SubTransformer, SubTransformerTransformParams} from "main_transformer"
import {CollectValuesTaskDef, ToolboxTransformerConfig} from "transformer_config"
import * as Path from "path"
import * as Tsc from "typescript"
import {isNodeExported, typeHasMarker} from "tsc_tricks"
import {getExportStatementText, setsEqual} from "utils"

type PathToValueInModule = string[]

interface ModulesOfTask {
	modules: Map<string, PathToValueInModule[]>
	def: CollectValuesTaskDef
}

export class CollectValuesTransformer implements SubTransformer {

	toString(): string {
		return "CollectValues"
	}

	constructor(
		tasks: CollectValuesTaskDef[],
		private readonly toolboxContext: ToolboxTransformer.TransformerProjectContext<ToolboxTransformerConfig>) {

		this.tasks = tasks.map(task => {
			task.file = Path.resolve(Path.dirname(toolboxContext.tsconfigPath), task.file)
			return {
				def: task,
				modules: new Map()
			}
		})

		this.tasks.forEach(task => this.generateFile(task))
	}

	private readonly tasks: ModulesOfTask[]

	onModuleDelete(moduleName: string): void {
		this.tasks.forEach(task => {
			if(task.modules.has(moduleName)){
				task.modules.delete(moduleName)
				this.generateFile(task)
			}
		})
	}

	transform(params: SubTransformerTransformParams): Tsc.SourceFile {
		// task index -> exported names
		let exportedValueNames = this.tasks.map(() => [] as PathToValueInModule[])

		let visitor = (node: Tsc.Node, namePath: string[]): Tsc.VisitResult<Tsc.Node> => {
			if(Tsc.isVariableStatement(node) && isNodeExported(Tsc, node)){
				for(let decl of node.declarationList.declarations){
					let type = params.typechecker.getTypeAtLocation(decl)
					this.tasks.forEach((task, taskIndex) => {
						if(typeHasMarker(Tsc, params.typechecker, type, task.def.markerName)){
							exportedValueNames[taskIndex].push([...namePath, decl.name.getText()])
						}
					})
				}
			} else if(Tsc.isModuleDeclaration(node) && node.body && isNodeExported(Tsc, node)){
				Tsc.visitEachChild(node.body, subnode => visitor(subnode, [...namePath, node.name.text]), params.transformContext)
			}

			return node
		}

		Tsc.visitEachChild(params.file, node => visitor(node, []), params.transformContext)

		this.tasks.forEach((task, taskIndex) => {
			let newExportedClasses = exportedValueNames[taskIndex]
			let oldExportedClasses = task.modules.get(params.moduleName)
			if(newExportedClasses.length > 0){
				if(!oldExportedClasses || !this.moduleValuesEquals(newExportedClasses, oldExportedClasses)){
					task.modules.set(params.moduleName, newExportedClasses)
					this.generateFile(task)
				}
			} else if(oldExportedClasses){
				task.modules.delete(params.moduleName)
				this.generateFile(task)
			}
		})

		return params.file
	}

	private moduleValuesEquals(a: PathToValueInModule[], b: PathToValueInModule[]): boolean {
		return setsEqual(new Set(a.map(x => x.join("."))), new Set(b.map(x => x.join("."))))
	}

	private generateFile(task: ModulesOfTask): void {
		let modulePrefix = this.toolboxContext.params?.generatedImportPrefixes || ""

		let moduleNames = [...task.modules.keys()].sort()

		let importStr = moduleNames.map((moduleName, i) => {
			return `import * as ${"_" + i} from "${modulePrefix + moduleName}";`
		})
			.join("\n")

		if(task.def.additionalImports){
			task.def.additionalImports.forEach(importLine => {
				importStr += "\n" + importLine
			})
		}

		let exportStr = getExportStatementText(moduleNames, task.def, task.modules)

		Tsc.sys.writeFile(task.def.file, generatedFileCommentPrefix + importStr + "\n\n" + exportStr)

		if(this.toolboxContext.imploder){
			this.toolboxContext.imploder.compiler.notifyFsObjectChange(task.def.file)
		}
	}

}