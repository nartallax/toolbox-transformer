import {ToolboxTransformer} from "entrypoint";
import {generatedFileCommentPrefix, SubTransformer, SubTransformerTransformParams} from "main_transformer";
import {CollectClassesTaskDef, ToolboxTransformerConfig} from "transformer_config";
import * as Path from "path";
import * as Tsc from "typescript";
import {declarationExtendsMarker, isNodeAbstract, isNodeExported, typeIsClasslikeExtendingMarker} from "tsc_tricks";
import {getExportStatementText, setsEqual} from "utils";

type PathToClassInModule = string[]

interface ModulesOfTask {
	modules: Map<string, PathToClassInModule[]>
	def: CollectClassesTaskDef;
}

export class CollectClassesTransformer implements SubTransformer {

	toString(): string {
		return "CollectClasses"
	}

	constructor(
		tasks: CollectClassesTaskDef[], 
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
		// task index -> exported names
		let exportedClassNames = this.tasks.map(() => [] as PathToClassInModule[]);

		let visitor = (node: Tsc.Node, namePath: string[]): Tsc.VisitResult<Tsc.Node> => {
			if(Tsc.isClassDeclaration(node) && node.name && isNodeExported(Tsc, node) && !isNodeAbstract(Tsc, node)){
				let name = node.name.text;
				this.tasks.forEach((task, taskIndex) => {
					if(declarationExtendsMarker(Tsc, params.typechecker, node, task.def.markerName)){
						exportedClassNames[taskIndex].push([...namePath, name]);
					}
				})
			} else if(Tsc.isVariableStatement(node) && isNodeExported(Tsc, node)){
				for(let decl of node.declarationList.declarations){
					let type = params.typechecker.getTypeAtLocation(decl);
					// optimise here? check if value is classlike before iteration
					this.tasks.forEach((task, taskIndex) => {
						if(typeIsClasslikeExtendingMarker(Tsc, params.typechecker, type, task.def.markerName)){
							exportedClassNames[taskIndex].push([...namePath, decl.name.getText()]);
						}
					})
				}
			} else if(Tsc.isModuleDeclaration(node) && node.body && isNodeExported(Tsc, node)) {
				Tsc.visitEachChild(node.body, subnode => visitor(subnode, [...namePath, node.name.text]), params.transformContext);
			}

			return node;
		}

		Tsc.visitEachChild(params.file, node => visitor(node, []), params.transformContext);

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

		return params.file;
	}

	private moduleClassesEquals(a: PathToClassInModule[], b: PathToClassInModule[]): boolean {
		return setsEqual(new Set(a.map(x => x.join("."))), new Set(b.map(x => x.join("."))))
	}

	private generateFile(task: ModulesOfTask): void {
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
	}

}