/** This is layout of config of the toolbox-transformer in tsconfig.json
 * All paths are resolved starting at tsconfig.json file */
export interface ToolboxTransformerConfig {
	/** What transformer should do when launched */
	tasks?: ToolboxTransformerTaskDefinition[]
	/** When the transformer generating import statement, what prefix should he use?
	 * Makes sense only for non-imploder usage */
	generatedImportPrefixes?: string
	/** Ignore modules which names matches any of these regular expressions
	 * It's good to ignore generated code directory, for example */
	ignoreModules?: string[]
}

export type ToolboxTransformerTaskDefinition = CollectToplevelCallsTaskDef
| CollectClassesTaskDef
| CollectValuesTaskDef
| PseudovariableTaskDef
| RemoveCallsTaskDef
| PseudomethodTaskDef
| CollectTypeofTypeMapTaskDef

/** This task will find all modules that have top-level calls of function returning certain type of value,
 * and generate imports of all these modules in a single file */
export interface CollectToplevelCallsTaskDef {
	type: "collect_toplevel_calls"
	/** Return type of function call */
	returnTypeName: string
	/** Path to a file the imports will be placed into */
	file: string
}

export type CollectTaskCollectionType = "set" | "array" | "readonly_set" | "readonly_array"
export type CollectTaskMapType = "map" | "object" | "readonly_map" | "readonly_object"

/** This task will find all classes that extend interface/class with certain name,
 * and generate file that will export collection of those classes
 * Will collect only toplevel, exported, non-abstract classes */
export interface CollectClassesTaskDef {
	type: "collect_classes"
	/** Name of interface/class the class must extend to be placed into array */
	markerName: string
	/** Path to file where array code will be generated */
	file: string
	/** Type of single item of the collection */
	collectionValueType: string
	/** Type of collection that will be generated */
	collectionType: CollectTaskCollectionType
	/** Under what name array will be exported */
	exportedName: string
	/** More imports, to make collectionValueType findable?
	 * Expected just lines like `import {MyValueClass} from "somewhere/my_module";` */
	additionalImports?: string[]
}

/** This task will find all values that extends certain interface/class,
 * and generate file that will export collection of those values */
export interface CollectValuesTaskDef {
	type: "collect_values"
	/** Name of interface/class the class must extend to be placed into array */
	markerName: string
	/** Path to file where array code will be generated */
	file: string
	/** Type of single item of the collection */
	collectionValueType: string
	/** Type of collection that will be generated */
	collectionType: CollectTaskCollectionType
	/** Under what name array will be exported */
	exportedName: string
	/** More imports, to make collectionValueType findable?
	 * Expected just lines like `import {MyValueClass} from "somewhere/my_module";` */
	additionalImports?: string[]
}

/** This task will substitute variables with certain types with some compile-time computed values */
export interface PseudovariableTaskDef {
	type: "pseudovariable"
	/** Name of marker interface to trigger on */
	markerName: string
	/** Type of value to use */
	valueType: "module_name" | "generation_date_seconds" | "json_file_value"
	/** Path to a file where data will be taken from */
	file?: string
	/** Identifiers and indices in JSON of the file to extract required information */
	jsonPath?: (string | number)[]
}

export interface RemoveCallsTaskDef {
	type: "remove_calls"
	/** Name of marker interface to trigger on */
	markerName: string
}

/** This task will allow you to mimic prototype extension, adding methods to existing objects */
export interface PseudomethodTaskDef {
	type: "pseudomethod"
	/** Name of marker interface to trigger on */
	markerName: string
}

/** This task will find all types that extend type expression, like type MyType = Expr<typeof Value>
 * And collect them into map like "MyType": Value */
export interface CollectTypeofTypeMapTaskDef {
	type: "collect_typeof_type_map"
	/** Name of interface/class the class must extend to trigger the transformer */
	markerName: string
	/** Where to place generated code */
	file: string
	/** Type of single item of the collection. Default: "unknown" */
	collectionValueType?: string
	/** Type of collection that will be generated */
	collectionType: CollectTaskMapType
	/** Under what name resulting value will be exported from generatedcode */
	exportedName: string
	/** How exactly string-keys in the map shoul look like?
	 * last_identifier - take just identifier of the type name
	 * all_identifiers - all the nesting, like namespaces + last_identifier
	 * all_identifiers_and_module_path - full path to module + all_identifiers (default) */
	typeNaming?: "last_identifier" | "all_identifiers" | "all_identifiers_and_module_path"
	/** More imports, to make collectionValueType findable?
	 * Expected just lines like `import {MyValueClass} from "somewhere/my_module";` */
	additionalImports?: string[]
	/** What value will have key if it has more than one value */
	onDuplicates: "null" | "array"
}

export function isCollectCallsTaskDef(x: unknown): x is CollectToplevelCallsTaskDef {
	return !!x && typeof(x) === "object" && (x as CollectToplevelCallsTaskDef).type === "collect_toplevel_calls"
}

export function isCollectClassesTaskDef(x: unknown): x is CollectClassesTaskDef {
	return !!x && typeof(x) === "object" && (x as CollectClassesTaskDef).type === "collect_classes"
}

export function isCollectValuesTaskDef(x: unknown): x is CollectValuesTaskDef {
	return !!x && typeof(x) === "object" && (x as CollectValuesTaskDef).type === "collect_values"
}

export function isPseudovariableTaskDef(x: unknown): x is PseudovariableTaskDef {
	return !!x && typeof(x) === "object" && (x as PseudovariableTaskDef).type === "pseudovariable"
}

export function isRemoveCallsTaskDef(x: unknown): x is RemoveCallsTaskDef {
	return !!x && typeof(x) === "object" && (x as RemoveCallsTaskDef).type === "remove_calls"
}

export function isPseudomethodTaskDef(x: unknown): x is PseudomethodTaskDef {
	return !!x && typeof(x) === "object" && (x as PseudomethodTaskDef).type === "pseudomethod"
}

export function isCollectTypeofTypeMapTaskDef(x: unknown): x is CollectTypeofTypeMapTaskDef {
	return !!x && typeof(x) === "object" && (x as CollectTypeofTypeMapTaskDef).type === "collect_typeof_type_map"
}