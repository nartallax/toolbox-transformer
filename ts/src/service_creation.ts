import {Imploder} from "@nartallax/imploder"
import {ToolboxTransformer} from "entrypoint"
import * as Tsc from "typescript"
import type * as Tsl from "typescript/lib/tsserverlibrary"
import * as Path from "path"

function doMakeTransformer<T>(makeFactory: ToolboxTransformer.TransformerFactoryMaker<T>, context: Imploder.Context | Tsc.Program, params?: T): Imploder.CustomTransformerFactory {

	let imploder = isProgram(context) ? undefined : context

	let factoryParams: ToolboxTransformer.TransformerProjectContext<T> = {
		imploder, params,
		get program(): Tsc.Program {
			return isProgram(context) ? context : context.compiler.program
		},
		get tsconfigPath(): string {
			return getTsconfigPath(imploder)
		}
	}

	return makeFactory(factoryParams)
}

export function makeImplodableTransformer<T>(makeFactory: ToolboxTransformer.TransformerFactoryMaker<T>): ToolboxTransformer.TransformerFactoryCreationFn<T> {
	return (context, params) => doMakeTransformer(makeFactory, context, params)
}

function doMakeServicePlugin(makePlugin: ToolboxTransformer.LanguageServicePluginMaker, libWrap: {typescript: typeof Tsc}): {create(info: Tsl.server.PluginCreateInfo): Tsc.LanguageService} {
	return {create: info => {
		let baseService = makeProxyService(info)
		let partialService = makePlugin({baseService, typescript: libWrap.typescript, pluginInfo: info})
		return {
			...baseService,
			...partialService
		}
	}}
}

export function makeLanguageServicePlugin(makePlugin: ToolboxTransformer.LanguageServicePluginMaker): ToolboxTransformer.LanguageServicePluginCreationFn {

	return libWrap => doMakeServicePlugin(makePlugin, libWrap)
}

export function makeTransformerOrPlugin<T>(makers: {
	makeTransformer: ToolboxTransformer.TransformerFactoryMaker<T>
	makePlugin: ToolboxTransformer.LanguageServicePluginMaker
}): ToolboxTransformer.LanguageServicePluginCreationFn | ToolboxTransformer.TransformerFactoryCreationFn<T> {

	let result = (inputValue: {typescript: typeof Tsl} | Imploder.Context | Tsc.Program, params?: T) => {
		if("typescript" in inputValue){
			return doMakeServicePlugin(makers.makePlugin, inputValue)
		} else {
			return doMakeTransformer(makers.makeTransformer, inputValue, params)
		}
	}

	// eslint-disable-next-line @typescript-eslint/no-explicit-any -- I failed to properly type it
	return result as any
}

function isProgram(x: unknown): x is Tsc.Program {
	return !!x && typeof(x) === "object" && typeof((x as Tsc.Program).emit) === "function"
}

function makeProxyService(pluginInfo: Tsl.server.PluginCreateInfo): Tsc.LanguageService {
	// source: https://github.com/Microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin
	const proxy: Tsc.LanguageService = Object.create(null)
	for(let k of Object.keys(pluginInfo.languageService) as (keyof Tsc.LanguageService)[]){
		// without the line, compiler complain about incorrect `this`
		// docs are saying all this should be done this way, so let's just cast to any
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		const x: any = pluginInfo.languageService[k]
		proxy[k] = (...args: unknown[]) => x.apply(pluginInfo.languageService, args)
	}
	return proxy
}


const tscProjectParamName = "--project"
const imploderProjectParamName = "--tsconfig"
const toolboxTransformerProjectParamName = "--tsconfig-path-for-toolbox-transformer"

function getTsconfigPath(imploder?: Imploder.Context): string {
	if(imploder){
		return imploder.config.tsconfigPath
	}

	// this is kinda hack
	// but as far as I understand tsc don't really gives you tsconfig.json path anywhere in its api
	// and we really need it to resolve paths

	let tscProjectValue: string | undefined = undefined
	let toolboxProjectValue: string | undefined = undefined
	// this value is here for case when project is built with Imploder, but transformer is applied as "program" and not "imploder"
	let imploderProjectValue: string | undefined = undefined
	for(let i = 0; i < process.argv.length; i++){
		let v = process.argv[i]
		if(v === tscProjectParamName){
			tscProjectValue = process.argv[i + 1]
		} else if(v === toolboxTransformerProjectParamName){
			toolboxProjectValue = process.argv[i + 1]
		} else if(v === imploderProjectParamName){
			imploderProjectValue = process.argv[i + 1]
		}
	}

	let value = toolboxProjectValue || tscProjectValue || imploderProjectValue
	if(!value){
		throw new Error(`Toolbox transformer failed to get path to tsconfig.json. Expected for it to be passed through command-line arguments with one of the following keys: ${toolboxTransformerProjectParamName}, ${tscProjectParamName} or ${imploderProjectParamName}.`)
	}

	return Path.resolve(value)
}