import {ToolboxTransformer} from "entrypoint"
import {SubTransformer, SubTransformerTransformParams} from "main_transformer"
import {CollectValuesTaskDef} from "transformer_config"
import * as Path from "path"
import * as Tsc from "typescript"
import {getImportStatementsText, getSequenceOrMapExportStatementText, setsEqual} from "utils"

type PathToValueInModule = string[]

interface ModulesOfTask {
	modules: Map<string, PathToValueInModule[]>
	def: CollectValuesTaskDef
}

export class CollectValuesTransformer extends SubTransformer {

	toString(): string {
		return "CollectValues"
	}

	constructor(
		tasks: CollectValuesTaskDef[],
		toolboxContext: ToolboxTransformer.TransformerProjectContext) {
		super()

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
			if(Tsc.isVariableStatement(node) && this.tricks.isNodeExported(node)){
				let varNames = this.tricks.getIdentifiersFromVariableDeclarations(node)
				for(let identifier of varNames){
					let type = params.typechecker.getTypeAtLocation(identifier)
					this.tasks.forEach((task, taskIndex) => {
						if(this.tricks.typeHasMarker(type, task.def.markerName)){
							exportedValueNames[taskIndex].push([...namePath, identifier.getText()])
						}
					})
				}
			} else if(Tsc.isModuleDeclaration(node) && node.body && this.tricks.isNodeExported(node)){
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
		let moduleNames = [...task.modules.keys()].sort()

		let importStr = getImportStatementsText(moduleNames, task.def)
		let exportStr = getSequenceOrMapExportStatementText(moduleNames, task.def, task.modules)

		this.tricks.writeGeneratedFile(task.def.file, importStr + exportStr)
	}

}