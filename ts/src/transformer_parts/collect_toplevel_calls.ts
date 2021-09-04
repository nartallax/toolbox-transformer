import {ToolboxTransformer} from "entrypoint";
import {generatedFileCommentPrefix, SubTransformer, SubTransformerTransformParams} from "main_transformer";
import {CollectToplevelCallsTaskDef, ToolboxTransformerConfig} from "transformer_config";
import * as Path from "path";
import * as Tsc from "typescript";
import {typeHasMarker} from "tsc_tricks";

interface ModulesOfTask {
	modules: Set<string>;
	def: CollectToplevelCallsTaskDef;
}

export class CollectToplevelCallsTransformer implements SubTransformer {

	toString(): string {
		return "CollectToplevelCalls"
	}

	constructor(
		tasks: CollectToplevelCallsTaskDef[], 
		private readonly toolboxContext: ToolboxTransformer.TransformerProjectContext<ToolboxTransformerConfig>){

		this.tasks = tasks.map(task => {
			task.file = Path.resolve(Path.dirname(toolboxContext.tsconfigPath), task.file);
			return {
				def: task,
				modules: new Set()
			};
		})

		this.tasks.forEach(task => this.generateFile(task));
	}

	private readonly tasks: ModulesOfTask[];

	onModuleDelete(moduleName: string): void{
		this.tasks.forEach(task => {
			if(task.modules.has(moduleName)){
				task.modules.delete(moduleName)
				this.generateFile(task);
			}
		});
	}

	transform(params: SubTransformerTransformParams): Tsc.SourceFile {
		let changedTasks = new Set<ModulesOfTask>();

		let doWithCallExpression = (node: Tsc.CallExpression): void => {
			let type = params.typechecker.getTypeAtLocation(node);
			this.tasks.forEach(task => {
				if(typeHasMarker(Tsc, params.typechecker, type, task.def.returnTypeName) && !task.modules.has(params.moduleName)){
					task.modules.add(params.moduleName);
					changedTasks.add(task);
				}
			})
		}

		let visitor = (node: Tsc.Node): Tsc.VisitResult<Tsc.Node> => {
			if(Tsc.isCallExpression(node)){
				doWithCallExpression(node);
			} else if(Tsc.isExpressionStatement(node) && Tsc.isCallExpression(node.expression)){
				doWithCallExpression(node.expression);
			} else if(Tsc.isModuleDeclaration(node) && node.body) {
				Tsc.visitEachChild(node.body, visitor, params.transformContext);
			} else if(Tsc.isBlock(node)){
				Tsc.visitEachChild(node, visitor, params.transformContext);
			}
			return node;
		}

		Tsc.visitEachChild(params.file, visitor, params.transformContext);

		changedTasks.forEach(task => this.generateFile(task));

		return params.file;
	}

	private generateFile(task: ModulesOfTask): void {
		let prefix = this.toolboxContext.params?.generatedImportPrefixes || "";

		let fileContent = [...task.modules]
			.sort()
			.map(module => 'import "' + prefix + module + '";')
			.join("\n")

		Tsc.sys.writeFile(task.def.file, generatedFileCommentPrefix + fileContent);

		if(this.toolboxContext.imploder){
			this.toolboxContext.imploder.compiler.notifyFsObjectChange(task.def.file);
		}
	}

}