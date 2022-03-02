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
		let externalPkg = getExternalPackageNameAndPath(localModuleNameOrPath)
		if(!externalPkg){
			return "/" + getRelativeModulePath(this.moduleRoot, localModuleNameOrPath)
		} else {
			return normalizeModulePath(externalPkg.filePathInPackage)
		}

	}

}

const tsFileExtensions: readonly string[] = [".ts", ".tsx", ".d.ts"]

function stripTsExt(path: string): string {
	let lc = path.toLowerCase()
	for(let ext of tsFileExtensions){
		if(lc.endsWith(ext)){
			path = path.substring(0, path.length - 5)
			break
		}
	}
	return path
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

function getExternalPackageNameAndPath(path: string): {packageName: string, filePathInPackage: string} | null {
	let pathParts = path.split(/[/\\]/)
	let packageName: string | null = null
	let packageNameStartsAt: number | null = null
	for(let i = pathParts.length - 2; i >= 0; i--){
		if(packageName === null){
			if(pathParts[i] === "node_modules"){
				let part = pathParts[i + 1]!
				if(part.startsWith("@")){
					if(i === pathParts.length - 2){
						throw new Error("Cannot deduce NPM package name from file path: " + path + ": last part of path is a namespace, but nothing comes after it.")
					}

					packageName = part + "/" + pathParts[i + 2]
				} else {
					packageName = part
				}
				packageNameStartsAt = i + 1
				break
			}
		}
	}

	if(packageName === null || packageNameStartsAt === null){
		return null
	}

	return {
		packageName,
		filePathInPackage: pathParts.slice(packageNameStartsAt).join("/")
	}
}