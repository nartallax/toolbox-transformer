import {Imploder} from "@nartallax/imploder"
import {ModuleImportStructure, parseModuleFileImports} from "tsc_tricks"
import * as Tsc from "typescript"

/** Storage for import data about modules
 * This data can be shared across multiple transformers */
export class ModuleImportsCache {

	constructor(private tsc: typeof Tsc, private imploder?: Imploder.Context) {}

	private moduleImportCache = new Map<string, ModuleImportStructure>()

	private keyOf(file: Tsc.SourceFile): string {
		let result = file.fileName
		if(this.imploder){
			result = this.imploder.modulePathResolver.getCanonicalModuleName(result)
		}
		return result
	}

	getImportsOf(file: Tsc.SourceFile, transformContext: Tsc.TransformationContext): ModuleImportStructure {
		let key = this.keyOf(file)
		let cached = this.moduleImportCache.get(key)
		if(cached){
			return cached
		}

		let result = parseModuleFileImports(this.tsc, file, transformContext)
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