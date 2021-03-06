
# Toolbox Transformer

This is a Typescript transformer that can do some things with your code and make development easier.  

## Install

	npm install --save-dev @nartallax/toolbox-transformer

Then you need to put something like this in your tsconfig.json:  

	{
		"compilerOptions": {
			"plugins": [{
					"transform": "@nartallax/toolbox-transformer", 
					"type":"imploder", <---- "program" will work here too if you're using ttypescript and not Imploder
					"ignoreModules": ["^/?generated"],
					"generatedImportPrefixes": "",
					"tasks": [
						... tasks here! ...
					]
				}
				... other transformers/plugins ...
			]
			... other compilerOptions ...
		}
	}

That is, you use this transformer as typical transformer in [ttypescript](https://www.npmjs.com/package/ttypescript) sense. It is mainly intended to use with [Imploder](https://github.com/nartallax/imploder) (but will probably work fine with ttypescript).  
Without any `tasks`, transformer won't do anything. With `tasks` you can tell the transformer exact things you want him to do. See below.  
`"imploder"` type is preferred; `"program"` is possible but won't work as well (module deletion is not handled; file generation won't happen on compiler start and so on).  
`ignoreModules` allows you to skip transformation of modules which names matches any of the regexps passed. Expected use-case is to ignore generated files, as you will probably never need to transform them.  
`generatedImportPrefixes` is a prefix that will be prepended to module names when they are imported in generated code. It's a way to make module resolving issues little easier.  

## Features

Before we start:  
Most of the time transformer detects target pieces of code by types in this code (see below for more specific cases). But not by actual types; just by names of types. That is, if your configuration says "target every function with return type of Control", it will capture all the functions that return value of this type, regardless of what actual class/interface the Control is.  
So the best way to use the transformer is to use marker interfaces. Marker interface is empty interface with a distinct name. You assign this interface to the values you want processed, then configure transformer to use that interface, and it triggers only on values you want. Also this transformer is tested only on marker interfaces.  
Also worth noting that marker interface is detectable if value is explicitly typed as this interface, or type of value explicitly inherits the interface, or has this interface as component of the type (that is, type (MARKER | null) is having the marker interface by transformer's logic); but not detectable if the value is implicitly conforms to marker interface, or uses marker interface as generic argument.  

Complete definition of config shape is [here](ts/src/transformer_config.ts). There are comments. You should consult this file in cases like "what values can this parameter be" and so on.  

### Generate a file that imports every module that has top-level call of function with a specific return type  

Use-case: you have a lot of function calls in different modules defining something (for example, [Clamsensor](https://www.npmjs.com/package/@nartallax/clamsensor) makes you define tests like this)  

Configuration (task):

	{
		"type":"collect_toplevel_calls", 
		"returnTypeName": "ENUMERATE_THIS_RETURN_TYPE", 
		"file": "generated/calls_enumeration.ts"
	}

Usage:  

	// this is the marker interface we will use in this example
	export interface ENUMERATE_THIS_RETURN_TYPE {}

	// this is how target function can be defined
	export function registerEntity(name: string): ENUMERATE_THIS_RETURN_TYPE | null {
		entityRepo.push(name);
		return null
	}

	// and this is call that is targeted by the transformer
	registerEntity("my_entity");

Calls that DO trigger the transformer: top-level calls (like in example below); top-level calls within namespaces; top-level calls within top-level blocks.  
Calls that DO NOT trigger the transformer: calls results of which are saved into variable (`let a = registerEntity("x")`); calls that are part of some more complex expression (`registerEntity("x") || false`).  

### Pseudomethods

Use-case: you want to add new method to built-in object like Array, but don't want to pollute prototype.  

How it works: when transformer discovers call of pseudomethod, it substitutes the call with the call of some other function, referenced indirectly. No actual prototype modification is done in runtime.  
Caveat: if you add method to, for example, Array, methods on arrays will run just fine; hovewer, if you cast an array to any, transformer would not be able to detect the pseudomethod, and call will fail in runtime.  

Configuration (task):  

	{
		"type":"pseudomethod",
		"markerName": "PSEUDOMETHOD"
	}

Usage:  
It is advised to separate definition in at least two files, typedefs and actual code, as shown in example below.  

[Actual code file](test_project/pseudomethod/pseudomethods.ts):  
(in this file, functions that will actually be invoked are defined)  

	// marker interface, more on that in other file
	export type PSEUDOMETHOD<T> = T

	// this function will actually be executed when [1,2,3].exists(x => x === 5) is called
	export function exists<T>(this: Array<T>, checker: (value: T) => boolean): boolean {
		for(let i = 0; i < this.length; i++){
			if(checker(this[i])){
				return true;
			}
		}
		return false;
	}

	// just for example: better organizing of referenced fuctions
	// should be detected as well
	export namespace ArrayMathFunctions {
		// this is also an example for more narrow generic typing
		// .sum won't be callable on array with something that is not number
		export function sum(this: Array<number>): number {
			let result = 0;
			for(let i = 0; i < this.length; i++){
				result += this[i];
			}
			return result;
		}
	}

[Typedefs file](test_project/pseudomethod/pseudomethod_typedefs.ts):
(in this file, functions are bound to methods of Array)

	// actual wording of imports here is important!
	// when transformer detects a pseudomethod, it needs to import real function code from somewhere
	// and it deduces the path to module from this very imports
	// so something like relative imports won't work well, as module paths are used as-is
	import {exists, PSEUDOMETHOD} from "pseudomethod/pseudomethods";
	import * as PmLib from "pseudomethod/pseudomethods";

	// adding fields to global interfaces here
	declare global {
		interface Array<T> {
			// pseudomethods must be referenced exactly like this
			// marker interface that has exactly one type parameter, 
			// and it's value is `typeof real_function_to_call`
			exists: PSEUDOMETHOD<typeof exists>
			// some nesting is allowed in function reference
			sum: PSEUDOMETHOD<typeof PmLib.ArrayMathFunctions.sum>
		}
	}

	// explicitly exporting nothing just to force this file to be a module
	// otherwise `declare global` won't work as well
	export {}

After that, you will be able to call your new methods just like ordinary methods: `[1,2,3].sum()`

### Generate a file that exports every class that implements interface

Use-case: you have single-page application which is composed of tabs, and you need to enumerate all this tabs in some sort of collection (implying the tabs are defined as classes).  

Configuration (task):  

	{
		"type":"collect_classes", 
		"markerName": "THIS_IS_PAGE_I_NEED_THIS", 
		"file": "generated/page_list.ts", 
		"collectionType": "readonly_array", 
		"collectionValueType": "{new(): Page}", 
		"additionalImports": ["import {Page} from \"classes_enumeration/page\";"], 
		"exportedName": "allThePages"
	}

Usage:  

	// this is the marker interface
	export interface THIS_IS_PAGE_I_NEED_THIS {}

	// this class WILL NOT be put into collection, because it is abstract
	export abstract class Page implements THIS_IS_PAGE_I_NEED_THIS {
		constructor(readonly name: string){}
	}

	// this class WILL be put into collection
	export class LoginPage extends Page {
		constructor(){
			super("login_page);
		}
	}

Values that DO trigger the transformer: exported classes that explicitly have the marker interface somewhere in inheritance chain; exported variables that have value of class with the marker. Nesting them into exported namespace(s) also triggers the transformer.  
Values that DO NOT trigger the transformer: non-exported classes; abstract classes; exported classes inside non-exported namespace(s).  

### Generate a file that exports every value of certain type

Use-case: you have a set of symbols in application that are defined and used all over the code, and you want to gather them in a single list.  

Configuration (task):  

	{
		"type":"collect_values", 
		"markerName": "FLAG_SYMBOL_TO_COLLECT", 
		"file": "generated/flag_list.ts",
		"collectionType": "readonly_set", // see config definition file for other collection types
		"collectionValueType": "FlagSymbol",
		"additionalImports": ["import {FlagSymbol} from \"value_enumeration/flag_symbol\";"],
		"exportedName": "allFlags"
	}

Usage:

	// this is the marker interface
	export interface FLAG_SYMBOL_TO_COLLECT {}

	// this is the type we will use, as interface cannot inherit symbol
	export type FlagSymbol = Symbol & FLAG_SYMBOL_TO_COLLECT;

	// this is utility function that will create instances of our type
	export function makeFlagSymbol(name: string): FlagSymbol {
		return Symbol(name);
	}

	// this value will be put into collection
	export const myFlag = makeFlagSymbol("my_flags");  

Values that DO trigger transformer: exported value that explicitly conform to the marker interface. Nesting them into exported namespaces is also allowed.  
Values that DO NOT trigger transformer: non-exported values; values in non-exported namespaces.  

### Substitute variables of certain type with values determined at compile-time

Use-case: you want to embed project version as string literal into your code.

Configuration (tasks):  

	{
		"type":"pseudovariable", 
		"markerName": "PACKAGE_VERSION_MARKER", 
		"valueType": "json_file_value", // see config definition file for other collection types
		"file": "./packagelike.json", 
		"jsonPath": ["description", "version"]
	},
	{
		"type":"pseudovariable", 
		"markerName": "MODULE_NAME_MARKER", 
		"valueType": "module_name"
	}

Usage:

	// marker interfaces
	interface PACKAGE_VERSION_MARKER {}
	interface MODULE_NAME_MARKER {}

	// variables that will be substituted when referenced
	export const packageVersion: string & PACKAGE_VERSION_MARKER = "<will be substituted>"
	export const moduleName: string & MODULE_NAME_MARKER = "<will be substituted>"

	// usage example - variables in following code will be substituted with compile-time values
	console.log(packageVersion.split("."));
	let x = moduleName + ", nya!"
	console.log(x);

Note that values from files are extracted from files at compiler start, and not on every transform. That is done for performance reasons.  
And, depending on your build setup, values from files (and "build time" values) may work poorly, as variables are only substituted on transform, and actual value in the file is not tracked; that can lead to outdated values in resulting code. It is therefore advised to fully delete output directory before each compiler start.  

### Remove function calls

Use-case: debug logging, or performance meters, or whatever else that should not appear in release build.  

Configuration (task):  

	{
		"type": "remove_calls",
		"markerName": "REMOVE_THIS_FUNCTION_CALL"
	}

Usage:  

	// marker interface
	export interface REMOVE_THIS_FUNCTION_CALL {}

	// function that returns marked type as result
	export function logDebug(line: string): REMOVE_THIS_FUNCTION_CALL | undefined {
		console.error(line);
		return undefined;
	}

	export function doSomething(): void  {
		// this call will be removed
		logDebug("Doing something!")
		process.exit(1);
	}

Note: function really should not return any value that you may want to use. If you do, removal of the call may lead to broken code.  

### Collect Map of type names to values using typeof

Use-case: some complicated user input validation system.  

Configuration (task):  

	{
		"type":"collect_typeof_type_map", 
		"markerName": "DTO_MARKER_TYPE",
		"file": "generated/dto_source_list_map.ts", 
		"collectionType": "readonly_object", 
		"exportedName": "dtoSourceListMap"
	}

Usage:  

	// marker interface
	export interface DTO_MARKER_TYPE {}

	// type expression to make things easier
	// it's not important what type it will be exactly
	// it just must have marker type and take type argument
	export type Binder<T> = {value: T} & DTO_MARKER_TYPE

	// some value that we will bind to types
	export const myValue = "i'm a string"

	// this will generate entry with key "BoundType" (maybe with module name, configurable)
	// and value myValue
	export type BoundType = Binder<typeof myValue>

	// this will do the same
	export interface BoundType2 extends Binder<typeof myValue>{}

### Add decorator to methods of marked classes with type information

Use-case: API method input data validation

Configuration (task):

	{
		"type":"decorate_method_types", 
		"markerName": "MY_API_CLASS",
		"decoratorName":"methodTypes",
		"importDecoratorFrom":"decorate_methods/method_decorator",
		"externalTypes": ["THIS_IS_EXTERNAL_TYPE"]
	}

Usage:

	// declare the decorator like this:
	export function methodTypes(types: ToolboxTransformer.ParameterDefinition[]): (target: unknown, propertyKey: string) => void {
		return () => {
			// ...whatever
		}
	}

	// declare marker interface
	export interface MY_API_CLASS {}

	// example class. decorator invocation will be added to all methods of the class
	export class MyClass implements MY_API_CLASS {
		action(order: Order, count: number): string { ... }
	}

	// marker for external types
	interface THIS_IS_EXTERNAL_TYPE {}
	
	// declaration of marked external types won't result in "shape" of the object in type descriptions
	// name of the declaration will be used instead in "external" type description
	interface Order extends THIS_IS_EXTERNAL_TYPE {
		id: number
	}

Caveat: when method references structure (interface/type) that is defined in separate file, the structure is "copied" into the decorator invocation. If you run typescript compiler in watch mode and edit structure, outdated structure will be stored in decorator invocation (that is, it won't update by itself, you need to trigger file build to update it). It's not a big deal, as you're already should build release builds from scratch; just an inconvenience.  
