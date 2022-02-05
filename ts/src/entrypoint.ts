import {Imploder} from "@nartallax/imploder"
import {MainTransformer} from "main_transformer"
import * as ServiceCreation from "service_creation"
import {ToolboxTransformerConfig} from "transformer_config"
import {TscAstTricks} from "tricks/ast_tricks"
import {TscCheckerTricks} from "tricks/checker_tricks"
import {ToolboxTransformerTricks} from "tricks/toolbox_transformer_tricks"
import {TscTransformerTricks} from "tricks/transformer_tricks"
import * as tsc from "typescript"
import type * as tsl from "typescript/lib/tsserverlibrary"

/*
	Language service plugin hints:

	Guide: https://github.com/Microsoft/TypeScript/wiki/Writing-a-Language-Service-Plugin

	VSCode won't load plugins mentioned in tsconfig.json unless selected Typescript version is Workspace verison: https://github.com/microsoft/vscode/issues/74220

	VSCode won't load plugin mentioned in tsconfig.json when its name is a path and not a package name (enable verbose logging of tsserver, see logs of Typescript in VSCode, look for semantic logs location, see "Skipped loading plugin ... because only package name is allowed plugin name")
	*/

export namespace ToolboxTransformer {

	/** When you are writing a transformer that could be used as "imploder" or "program" transformer,
	 * you can just `export = ` result of this function and it will work */
	export const makeImplodableTransformer: <T>(makeFactory: ToolboxTransformer.TransformerFactoryMaker<T>) => ToolboxTransformer.TransformerFactoryCreationFn<T> = ServiceCreation.makeImplodableTransformer

	/** A classes of trick collections for a lot of different cases
	 * Use whatever suits you */
	export const AstTricks = TscAstTricks
	export const CheckerTricks = TscCheckerTricks
	export const TransformerTricks = TscTransformerTricks
	export const ToolboxTricks = ToolboxTransformerTricks

	export type TransformerFactoryMaker<T> = (opts: ToolboxTransformer.TransformerProjectContext<T>) => Imploder.CustomTransformerFactory

	export interface TransformerProjectContext<T = unknown> {
		readonly imploder?: Imploder.Context
		readonly program: tsc.Program
		readonly params?: T
		readonly tsconfigPath: string
	}

	/** This is type of value ttypescript and Imploder expects to see when loading a transformer
	 * You probably will never need to use it directly */
	export type TransformerFactoryCreationFn<T> = (context: Imploder.Context | tsc.Program, params?: T) => Imploder.CustomTransformerFactory

	/** When you are writing a language service plugin,
	 * you can just `export = ` result of this function and it will work */
	export const makeLanguageServicePlugin: (makePlugin: ToolboxTransformer.LanguageServicePluginMaker) => ToolboxTransformer.LanguageServicePluginCreationFn = ServiceCreation.makeLanguageServicePlugin

	export type LanguageServicePluginMaker = (opts: ToolboxTransformer.LanguagePluginProjectContext) => Partial<tsc.LanguageService>
	/** This is type of value tsserver expects to see when loading language service plugin
	 * You probably will never need to use it directly */
	export type LanguageServicePluginCreationFn = (inputValue: {typescript: typeof tsl}) => {create(info: tsl.server.PluginCreateInfo): tsc.LanguageService}

	export interface LanguagePluginProjectContext {
		/** When the Typescript language service plugin is executed, the Typescript library is passed to you
		 * It is done to ensure that you will have always 100% correct language lib version
		 * So, you should use this value instead of importing it */
		typescript: typeof tsc
		pluginInfo: tsl.server.PluginCreateInfo
		/** Typescript implies that there is only one language service per program
		 * So, to add your own language service, you override some of the existing methods
		 * But that also means that you must call the original methods, otherwise things will break
		 * The @param baseService is the instance you must call original methods on.
		 * (and no, it's not always possible to correctly chain-call them automatically)
		 * (for instance, because sometimes array is returned, and you really should give user control about what to do with it) */
		baseService: tsc.LanguageService
	}

	/** When you are writing a transformer and a service plugin in one module,
	 * you can just `export = ` result of this function and it will work both as a transformer and a plugin
	 * This is basically the makeImplodableTransformer and makeLanguageServicePlugin in one function */
	export const makeTransformerOrPlugin: <T>(makers: {
		makeTransformer: ToolboxTransformer.TransformerFactoryMaker<T>
		makePlugin: ToolboxTransformer.LanguageServicePluginMaker
	}) => ToolboxTransformer.LanguageServicePluginCreationFn | ToolboxTransformer.TransformerFactoryCreationFn<T> = ServiceCreation.makeTransformerOrPlugin

	export interface DiagnosticSourceData {
		category: tsl.DiagnosticCategory
		messageText: string
		/** Name of language service plugin here */
		source: string
		sourceFile?: tsc.SourceFile
		node?: tsc.Node
		code?: number
	}

}


export default ToolboxTransformer.makeImplodableTransformer((toolboxContext: ToolboxTransformer.TransformerProjectContext<ToolboxTransformerConfig>): Imploder.CustomTransformerFactory => {


	let transformer = new MainTransformer(toolboxContext)

	let result: Imploder.CustomTransformerFactory = transformContext => {
		return file => {
			return transformer.transform(file, transformContext)
		}
	}
	result.onModuleDelete = moduleName => transformer.onModuleDelete(moduleName)

	return result

})