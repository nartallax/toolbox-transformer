import {ToolboxTransformer} from "entrypoint"
import {isCollectClassesTaskDef, isCollectCallsTaskDef, ToolboxTransformerConfig, isCollectValuesTaskDef, isPseudovariableTaskDef, isRemoveCallsTaskDef, isPseudomethodTaskDef, isCollectTypeofTypeMapTaskDef} from "transformer_config"
import * as Tsc from "typescript"
import * as Path from "path"
import {CollectToplevelCallsTransformer} from "transformer_parts/collect_toplevel_calls"
import {CollectClassesTransformer} from "transformer_parts/collect_classes"
import {CollectValuesTransformer} from "transformer_parts/collect_values"
import {PseudovariableTransformer} from "transformer_parts/pseudovariable"
import {RemoveCallsTransformer} from "transformer_parts/remove_calls"
import {PseudomethodsTransformer} from "transformer_parts/pseudomethods"
import {ModuleImportsCache} from "imports_cache"
import {TypeofTypeMapTransformer} from "transformer_parts/typeof_type_map"
import {ToolboxTransformerTricks} from "tricks/toolbox_transformer_tricks"
import {ModuleImportStructure} from "tricks/transformer_tricks"
import {ModulePathResolver, ModulePathResolverImpl} from "module_path_resolver"
import {TscAstTricks} from "tricks/ast_tricks"


export class MainTransformer {

	private readonly allTransformers = [] as SubTransformer[]
	private readonly ignoreRegexps = [] as RegExp[]
	private readonly importsCache: ModuleImportsCache
	private _modulePathResolver: ModulePathResolver | null = null
	private get modulePathResolver(): ModulePathResolver {
		if(this.toolboxContext.imploder){
			return this.toolboxContext.imploder.modulePathResolver
		} else {
			return this._modulePathResolver ||= new ModulePathResolverImpl(
				this.toolboxContext.tsconfigPath,
				this.toolboxContext.program
			)
		}
	}

	constructor(
		private readonly toolboxContext: ToolboxTransformer.TransformerProjectContext<ToolboxTransformerConfig>
	) {
		// yea, yea, ugly hack, I know
		// I just need for any tricks to be present during initial file generation phase
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		currentTricks = new TscAstTricks(Tsc) as any

		this.importsCache = new ModuleImportsCache(Tsc,
			() => toolboxContext.program.getTypeChecker(),
			() => this.modulePathResolver
		)
		this.ignoreRegexps = (toolboxContext.params?.ignoreModules || []).map(str => new RegExp(str))

		if(toolboxContext.params && toolboxContext.params.tasks){
			let collectCallsTasks = toolboxContext.params.tasks.filter(isCollectCallsTaskDef)
			if(collectCallsTasks.length > 0){
				let transformer = new CollectToplevelCallsTransformer(collectCallsTasks, toolboxContext)
				this.allTransformers.push(transformer)
			}

			let collectClassesTasks = toolboxContext.params.tasks.filter(isCollectClassesTaskDef)
			if(collectClassesTasks.length > 0){
				let transformer = new CollectClassesTransformer(collectClassesTasks, toolboxContext)
				this.allTransformers.push(transformer)
			}

			let collectValuesTask = toolboxContext.params.tasks.filter(isCollectValuesTaskDef)
			if(collectValuesTask.length > 0){
				let transformer = new CollectValuesTransformer(collectValuesTask, toolboxContext)
				this.allTransformers.push(transformer)
			}

			let pseudovariableTasks = toolboxContext.params.tasks.filter(isPseudovariableTaskDef)
			if(pseudovariableTasks.length > 0){
				let transformer = new PseudovariableTransformer(pseudovariableTasks, toolboxContext)
				this.allTransformers.push(transformer)
			}

			let removeCallTasks = toolboxContext.params.tasks.filter(isRemoveCallsTaskDef)
			if(removeCallTasks.length > 0){
				let transformer = new RemoveCallsTransformer(removeCallTasks)
				this.allTransformers.push(transformer)
			}

			let pseudomethodTasks = toolboxContext.params.tasks.filter(isPseudomethodTaskDef)
			if(pseudomethodTasks.length > 0){
				let transformer = new PseudomethodsTransformer(pseudomethodTasks)
				this.allTransformers.push(transformer)
			}

			let typeofTypeMapTasks = toolboxContext.params.tasks.filter(isCollectTypeofTypeMapTaskDef)
			if(typeofTypeMapTasks.length > 0){
				let transformer = new TypeofTypeMapTransformer(typeofTypeMapTasks, toolboxContext)
				this.allTransformers.push(transformer)
			}

		}
	}

	private shouldIgnore(moduleName: string): boolean {
		for(let reg of this.ignoreRegexps){
			if(moduleName.match(reg)){
				return true
			}
		}
		return false
	}

	onModuleDelete(moduleName: string): void {
		this.importsCache.clearCacheOf(moduleName)
		this.allTransformers.forEach(transformer => transformer.onModuleDelete(moduleName))
	}

	private getCanonicalNameFor(file: Tsc.SourceFile): string {
		if(this.toolboxContext.imploder){
			return this.toolboxContext.imploder.modulePathResolver.getCanonicalModuleName(file.fileName)
		}

		let tsconfigDir = Path.dirname(this.toolboxContext.tsconfigPath)
		let moduleRoot = Path.resolve(tsconfigDir, this.toolboxContext.program.getCompilerOptions().rootDir || ".")
		let result = Path.relative(moduleRoot, file.fileName).replace(/\.tsx?$/i, "").replace(/\\/g, "/")
		if(this.toolboxContext.params && this.toolboxContext.params.generatedImportPrefixes){
			result = this.toolboxContext.params.generatedImportPrefixes + result
		}
		return result
	}

	transform(file: Tsc.SourceFile, transformContext: Tsc.TransformationContext): Tsc.SourceFile {
		this.importsCache.clearCacheOf(file)

		let moduleName = this.getCanonicalNameFor(file)

		if(this.shouldIgnore(moduleName)){
			return file
		}

		let params: SubTransformerTransformParams = {
			typechecker: this.toolboxContext.program.getTypeChecker(),
			moduleName, file, transformContext,
			getImportsFor: file => this.importsCache.getImportsOf(file, transformContext)
		}

		currentTricks = new ToolboxTransformerTricks(this.toolboxContext, transformContext, Tsc)

		let wasErrors = false
		this.allTransformers.forEach(transformer => {
			try {
				params.file = transformer.transform(params)
			} catch(e){
				wasErrors = true
				console.error("Toolbox transformer part (" + transformer + ") throws error on file " + params.file.fileName + " : " + (e as Error).stack)
			}
		})

		if(wasErrors){
			throw new Error("One of sub-transformers threw an error. Transformation failed.")
		}

		return params.file
	}
}

export interface SubTransformerTransformParams {
	file: Tsc.SourceFile
	moduleName: string
	typechecker: Tsc.TypeChecker
	transformContext: Tsc.TransformationContext
	getImportsFor(moduleFile: Tsc.SourceFile): ModuleImportStructure
}

let currentTricks: ToolboxTransformerTricks | null = null

export abstract class SubTransformer {
	get tricks(): ToolboxTransformerTricks {
		if(!currentTricks){
			throw new Error("No tricks!")
		}
		return currentTricks
	}

	abstract transform(params: SubTransformerTransformParams): Tsc.SourceFile
	abstract onModuleDelete(moduleName: string): void
}