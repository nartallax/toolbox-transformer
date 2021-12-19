import * as Path from "path"
import * as Tsc from "typescript"

export interface ModulePathResolver {
	resolveModuleDesignator(moduleDesignator: string, sourceFile: string): string
	getCanonicalModuleName(localModuleNameOrPath: string): string
}

/* Copypasted directly from Imploder, all comments on implementation is there
Just need this class to be here to be less depentent on Imploder */
export class ModulePathResolverImpl {

	private readonly moduleRoot: string
	private readonly ambientModules: Set<string>

	constructor(tsconfigPath: string, private readonly program: Tsc.Program) {
		let rootDir = program.getCompilerOptions().rootDir || "."
		this.moduleRoot = Path.resolve(Path.dirname(tsconfigPath), rootDir)
		let ambientMods = program.getTypeChecker().getAmbientModules().map(x => x.name.replace(/(?:^['"]|['"]$)/g, ""))
		this.ambientModules = new Set(ambientMods)
	}

	resolveModuleDesignator(moduleDesignator: string, sourceFile: string): string {
		if(this.ambientModules.has(moduleDesignator)){
			return moduleDesignator
		}

		let res = Tsc.resolveModuleName(
			moduleDesignator,
			sourceFile,
			this.program.getCompilerOptions(),
			Tsc.sys
		)

		if(!res.resolvedModule){
			return moduleDesignator
		}

		if(res.resolvedModule.isExternalLibraryImport){
			return moduleDesignator
		}

		if(isPathNested(res.resolvedModule.resolvedFileName, this.moduleRoot)){
			let filename = res.resolvedModule.resolvedFileName.toLowerCase()
			if(filename.endsWith(".ts") && !filename.endsWith(".d.ts")){
				return this.getCanonicalModuleName(res.resolvedModule.resolvedFileName)
			}
		}

		return moduleDesignator
	}

	getCanonicalModuleName(localModuleNameOrPath: string): string {
		return "/" + getRelativeModulePath(this.moduleRoot, localModuleNameOrPath)
	}

}

const tsFileExtensions: ReadonlySet<string> = new Set([".ts", ".tsx"])
const fileExtensionRegexp = /\.[^.]+$/

function isTsExt(path: string): boolean {
	let extMatch = path.match(fileExtensionRegexp)
	if(!extMatch){
		return false
	}
	let ext = extMatch[0].toLowerCase()
	return tsFileExtensions.has(ext)
}

function stripTsExt(path: string): string {
	return isTsExt(path) ? path.replace(fileExtensionRegexp, "") : path
}

function normalizeModulePath(p: string): string {
	return stripTsExt(p.replace(/\\/g, "/"))
}

function getRelativeModulePath(startAt: string, relModulePath: string): string {
	return normalizeModulePath(Path.relative(startAt, relModulePath))
}

export function isPathNested(a: string, b: string): boolean {
	a = a.replace(/[\\/]/g, "/")
	b = b.replace(/[\\/]/g, "/")
	if(a === b){
		return false
	}

	let starts = a.startsWith(b)
	if(!starts && b.startsWith(a)){
		starts = true
		let c = b
		b = a
		a = c
	}
	if(!starts){
		return false
	}

	let partsA = a.split("/")
	let partsB = b.split("/")
	return partsA[partsB.length - 1] === partsB[partsB.length - 1]
}