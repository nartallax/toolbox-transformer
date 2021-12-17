import {ToolboxTransformer} from "entrypoint";
import {isCollectClassesTaskDef, isCollectCallsTaskDef, ToolboxTransformerConfig, isCollectValuesTaskDef, isPseudovariableTaskDef, isRemoveCallsTaskDef, isPseudomethodTaskDef, isTjsClassesTaskDef} from "transformer_config";
import * as Tsc from "typescript";
import * as Path from "path";
import {CollectToplevelCallsTransformer} from "transformer_parts/collect_toplevel_calls";
import {CollectClassesTransformer} from "transformer_parts/collect_classes";
import {CollectValuesTransformer} from "transformer_parts/collect_values";
import {PseudovariableTransformer} from "transformer_parts/pseudovariable";
import {RemoveCallsTransformer} from "transformer_parts/remove_calls";
import {PseudomethodsTransformer} from "transformer_parts/pseudomethods";
import {TjsClassesTransformer} from "transformer_parts/tjs_class";


export class MainTransformer {

	private readonly allTransformers = [] as SubTransformer[];
	private readonly ignoreRegexps = [] as RegExp[];

	constructor(
		private readonly toolboxContext: ToolboxTransformer.TransformerProjectContext<ToolboxTransformerConfig>
	){
		this.ignoreRegexps = (toolboxContext.params?.ignoreModules || []).map(str => new RegExp(str));

		if(toolboxContext.params && toolboxContext.params.tasks){
			let collectCallsTasks = toolboxContext.params.tasks.filter(isCollectCallsTaskDef)
			if(collectCallsTasks.length > 0){
				let transformer = new CollectToplevelCallsTransformer(collectCallsTasks, toolboxContext);
				this.allTransformers.push(transformer);
			}

			let collectClassesTasks = toolboxContext.params.tasks.filter(isCollectClassesTaskDef)
			if(collectClassesTasks.length > 0){
				let transformer = new CollectClassesTransformer(collectClassesTasks, toolboxContext);
				this.allTransformers.push(transformer);
			}

			let collectValuesTask = toolboxContext.params.tasks.filter(isCollectValuesTaskDef);
			if(collectValuesTask.length > 0){
				let transformer = new CollectValuesTransformer(collectValuesTask, toolboxContext);
				this.allTransformers.push(transformer);
			}

			let pseudovariableTasks = toolboxContext.params.tasks.filter(isPseudovariableTaskDef);
			if(pseudovariableTasks.length > 0){
				let transformer = new PseudovariableTransformer(pseudovariableTasks, toolboxContext);
				this.allTransformers.push(transformer);
			}

			let removeCallTasks = toolboxContext.params.tasks.filter(isRemoveCallsTaskDef);
			if(removeCallTasks.length > 0){
				let transformer = new RemoveCallsTransformer(removeCallTasks);
				this.allTransformers.push(transformer);
			}

			let pseudomethodTasks = toolboxContext.params.tasks.filter(isPseudomethodTaskDef);
			if(pseudomethodTasks.length > 0){
				let transformer = new PseudomethodsTransformer(pseudomethodTasks);
				this.allTransformers.push(transformer);
			}

			let tjsClassesTasks = toolboxContext.params.tasks.filter(isTjsClassesTaskDef);
			if(tjsClassesTasks.length > 0){
				let transformer = new TjsClassesTransformer(tjsClassesTasks, toolboxContext);
				this.allTransformers.push(transformer);
			}

		}
	}

	private shouldIgnore(moduleName: string): boolean {
		for(let reg of this.ignoreRegexps){
			if(moduleName.match(reg)){
				return true;
			}
		}
		return false;
	}

	onModuleDelete(moduleName: string): void{
		this.allTransformers.forEach(transformer => transformer.onModuleDelete(moduleName));
	}

	transform(file: Tsc.SourceFile, transformContext: Tsc.TransformationContext): Tsc.SourceFile {
		let moduleName: string;
		if(this.toolboxContext.imploder){
			moduleName = this.toolboxContext.imploder.modulePathResolver.getCanonicalModuleName(file.fileName);
		} else {
			let tsconfigDir = Path.dirname(this.toolboxContext.tsconfigPath);
			let moduleRoot = Path.resolve(tsconfigDir, this.toolboxContext.program.getCompilerOptions().rootDir || ".");
			moduleName = Path.relative(moduleRoot, file.fileName).replace(/\.tsx?$/i, "").replace(/\\/g, "/")
			if(this.toolboxContext.params && this.toolboxContext.params.generatedImportPrefixes){
				moduleName = this.toolboxContext.params.generatedImportPrefixes + moduleName
			}
		}

		if(this.shouldIgnore(moduleName)){
			return file
		}

		let params: SubTransformerTransformParams = {
			typechecker: this.toolboxContext.program.getTypeChecker(),
			moduleName, file, transformContext
		}

		this.allTransformers.forEach(transformer => {
			try {
				params.file = transformer.transform(params);
			} catch(e){
				console.error("Toolbox transformer part (" + transformer + ") throws error on file " + params.file.fileName + " : " + (e as Error).stack);
			}
		});

		return params.file;
	}
}

export interface SubTransformerTransformParams {
	file: Tsc.SourceFile;
	moduleName: string;
	typechecker: Tsc.TypeChecker;
	transformContext: Tsc.TransformationContext
}

export interface SubTransformer {
	transform(params: SubTransformerTransformParams): Tsc.SourceFile;
	onModuleDelete(moduleName: string): void;
}

export const generatedFileCommentPrefix = "/* This file is autogenerated. Your direct changes will be lost. */\n\n"