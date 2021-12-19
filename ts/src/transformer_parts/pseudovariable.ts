import {ToolboxTransformer} from "entrypoint"
import {PseudovariableTaskDef, ToolboxTransformerConfig} from "transformer_config"
import * as Path from "path"
import * as Tsc from "typescript"
import {createLiteralOfValue, typeHasMarker} from "tsc_tricks"
import {SubTransformer, SubTransformerTransformParams} from "main_transformer"

interface PseudovariableTaskWithValue {
	def: PseudovariableTaskDef
	getValue(context: SubTransformerTransformParams): Tsc.Expression
}

export class PseudovariableTransformer implements SubTransformer {

	toString(): string {
		return "Pseudovariable"
	}

	private readonly tasks: PseudovariableTaskWithValue[]

	constructor(tasks: PseudovariableTaskDef[],
		private readonly toolboxContext: ToolboxTransformer.TransformerProjectContext<ToolboxTransformerConfig>) {

		this.tasks = tasks.map(task => ({
			def: task,
			getValue: this.makeGetValueFunction(task)
		}))
	}

	private makeGetValueFunction(def: PseudovariableTaskDef): (context: SubTransformerTransformParams) => Tsc.Expression {
		switch(def.valueType){
			case "module_name":
				return context => createLiteralOfValue(Tsc, context.moduleName)
			case "generation_date_seconds":
				return () => createLiteralOfValue(Tsc, Date.now() / 1000)
			case "json_file_value":{
				let filePath = def.file
				if(!filePath){
					throw new Error("Transformer misconfigured: this task must have filePath: " + JSON.stringify(def))
				}
				let jsonPath = def.jsonPath
				if(!Array.isArray(jsonPath)){
					throw new Error("Transformer misconfigured: this task must have jsonPath array: " + JSON.stringify(def))
				}
				filePath = Path.resolve(Path.dirname(this.toolboxContext.tsconfigPath), filePath)
				let fileStr = Tsc.sys.readFile(filePath, "utf-8")
				if(!fileStr){
					throw new Error("File " + filePath + " not found.")
				}
				let value = JSON.parse(fileStr)
				let passedPath: (string | number)[] = []
				for(let pathPart of jsonPath){
					if(typeof(value) !== "object" || value === null){
						throw new Error("Failed to follow jsonPath in file " + filePath + ": partial path " + JSON.stringify(passedPath) + " returned non-traversable value " + (value === undefined ? undefined : JSON.stringify(value)))
					}
					value = value[pathPart]
					passedPath.push(pathPart)
				}
				return () => createLiteralOfValue(Tsc, value)
			}
		}
	}

	transform(params: SubTransformerTransformParams): Tsc.SourceFile {
		let visitor = (node: Tsc.Node): Tsc.VisitResult<Tsc.Node> => {
			if(Tsc.isVariableDeclaration(node)){
				// we should never try to substitute anything in name and type parts of variable declarations
				// as it will make impossible to actually declare variable with desired type
				if(node.initializer){
					let newInitializer = Tsc.visitEachChild(node.initializer, visitor, params.transformContext)
					return Tsc.factory.updateVariableDeclaration(node, node.name, node.exclamationToken, node.type, newInitializer)
				} else {
					return node
				}
			}

			if(Tsc.isInterfaceDeclaration(node)){
				// we also should never alter interface declaration, as it will break declarations of marker interfaces
				// also there is no values inside interface declarations, so no point in looking deeper
				return node
			}

			if(Tsc.isIdentifier(node)){
				let type = params.typechecker.getTypeAtLocation(node)
				for(let i = 0; i < this.tasks.length; i++){
					let task = this.tasks[i]
					if(typeHasMarker(Tsc, params.typechecker, type, task.def.markerName)){
						return task.getValue(params)
					}
				}
			}

			return Tsc.visitEachChild(node, visitor, params.transformContext)
		}

		return Tsc.visitEachChild(params.file, visitor, params.transformContext)
	}


	onModuleDelete(): void {
		// nothing. this transformer don't care.
	}


}