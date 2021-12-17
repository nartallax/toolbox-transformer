import {ToolboxTransformer} from "entrypoint";
import {SubTransformer, SubTransformerTransformParams} from "main_transformer";
import {TjsClassesTaskDef, ToolboxTransformerConfig} from "transformer_config";
import * as Path from "path";
import * as Tsc from "typescript";
import * as TJS from "typescript-json-schema";
import {CollectClassesTransformer} from "transformer_parts/collect_classes";

type ClassInModule = {
	pathToValue: string[]
	schema: TJS.Definition
}

interface ModulesOfTask {
	modules: Map<string, ClassInModule[]>
	def: TjsClassesTaskDef;
}

export class TjsClassesTransformer implements SubTransformer {

	toString(): string {
		return "TjsClasses"
	}

	constructor(
		tasks: TjsClassesTaskDef[], 
		private readonly toolboxContext: ToolboxTransformer.TransformerProjectContext<ToolboxTransformerConfig>){

		this.tasks = tasks.map(task => {
			task.file = Path.resolve(Path.dirname(toolboxContext.tsconfigPath), task.file);
			return {
				def: task,
				modules: new Map()
			};
		})

		this.tasks.forEach(task => this.generateFile(task))
	}

	private readonly tasks: ModulesOfTask[];

	onModuleDelete(moduleName: string): void{
		this.tasks.forEach(task => {
			if(task.modules.has(moduleName)){
				task.modules.delete(moduleName);
				this.generateFile(task);
			}
		});
	}

	transform(params: SubTransformerTransformParams): Tsc.SourceFile {
		let exportedClassNames = CollectClassesTransformer.findClassesWithPaths(
			params, 
			this.tasks.map(x => x.def)
		)

		let tjsParams: Partial<TJS.Args> = {
			typeOfKeyword: true

		}

		let firstClass = exportedClassNames[0]?.[0]?.[0]
		if(firstClass){
			let schema = TJS.generateSchema(this.toolboxContext.program, firstClass, tjsParams)
			console.error(schema);
		}

/*
		this.tasks.forEach((task, taskIndex) => {
			let newExportedClasses = exportedClassNames[taskIndex];
			let oldExportedClasses = task.modules.get(params.moduleName);
			if(newExportedClasses.length > 0){
				if(!oldExportedClasses || !this.moduleClassesEquals(newExportedClasses, oldExportedClasses)){
					task.modules.set(params.moduleName, newExportedClasses);
					this.generateFile(task);
				}
			} else if(oldExportedClasses){
				task.modules.delete(params.moduleName);
				this.generateFile(task);
			}
		});
*/
		return params.file;
	}
/*
	private moduleClassesEquals(a: ClassInModule[], b: ClassInModule[]): boolean {
		return setsEqual(new Set(a.map(x => x.join("."))), new Set(b.map(x => x.join("."))))
	}
*/
	private generateFile(task: ModulesOfTask): void {
		void task;
		/*
		let modulePrefix = this.toolboxContext.params?.generatedImportPrefixes || "";

		let moduleNames = [...task.modules.keys()].sort()

		let importStr = moduleNames.map((moduleName, i) => {
				return `import * as ${"_" + i} from "${modulePrefix + moduleName}";`
			})
			.join("\n");

		if(task.def.additionalImports){
			task.def.additionalImports.forEach(importLine => {
				importStr += "\n" + importLine
			});
		}

		let exportStr = getExportStatementText(moduleNames, task.def, task.modules);

		Tsc.sys.writeFile(task.def.file, generatedFileCommentPrefix + importStr + "\n\n" + exportStr);

		if(this.toolboxContext.imploder){
			this.toolboxContext.imploder.compiler.notifyFsObjectChange(task.def.file);
		}
		*/
	}

}