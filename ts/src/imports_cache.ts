import {ModulePathResolver} from "module_path_resolver"
import {ModuleImportStructure, TscTransformerTricks} from "tricks/transformer_tricks"
import * as Tsc from "typescript"

/** Storage for import data about modules
 * This data can be shared across multiple transformers */
export class ModuleImportsCache {

	constructor(
		private readonly tsc: typeof Tsc,
		private readonly checker: () => Tsc.TypeChecker,
		private readonly modulePathResolver: () => ModulePathResolver) {}

	private moduleImportCache = new Map<string, ModuleImportStructure>()

	private keyOf(file: Tsc.SourceFile): string {
		return this.modulePathResolver().getCanonicalModuleName(file.fileName)
	}

	getImportsOf(file: Tsc.SourceFile, transformContext: Tsc.TransformationContext): ModuleImportStructure {
		let key = this.keyOf(file)
		let cached = this.moduleImportCache.get(key)
		if(cached){
			return cached
		}

		let result = new TscTransformerTricks(this.tsc, this.checker(), transformContext).parseModuleFileImports(file)
		this.moduleImportCache.set(key, result)
		return result
	}

	clearCacheOf(file: Tsc.SourceFile | string): void {
		let key = typeof(file) === "string" ? file : this.keyOf(file)
		if(this.moduleImportCache.has(key)){
			this.moduleImportCache.delete(key)
		}
	}

}