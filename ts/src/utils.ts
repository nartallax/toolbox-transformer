import {CollectTaskCollectionType, CollectTaskMapType} from "transformer_config"

/** Are two sets equal? */
export function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
	if(a.size !== b.size){
		return false
	}

	for(let item of a){
		if(!b.has(item)){
			return false
		}
	}

	return true
}

interface SequenceOrMapExportingTaskDefBase {
	collectionValueType: string
	collectionType: CollectTaskCollectionType | CollectTaskMapType
	exportedName: string
}

/** Generate string that will contain export of values
 * If maplike type is selected, key will contain name of module and chain of identifiers leading to value
 * @param modules module names in import order. Implied that module objects are imported as _0, _1 etc
 * @param values value references, grouped by module name: moduleName -> path_to_value[] */
export function getSequenceOrMapExportStatementText(moduleNames: string[], taskDef: SequenceOrMapExportingTaskDefBase, values: Map<string, string[][]>, keyType = "string"): string {
	let exportValueStr: string

	let joinSort = (moduleIndex: number): string[] => {
		let identifiers = values.get(moduleNames[moduleIndex])
		return (identifiers || []).map(names => {
			return "_" + moduleIndex + names.map(name => `[${JSON.stringify(name)}]`).join("")
		}).sort()
	}

	let joinSortAddKey = (moduleIndex: number): [string, string][] => {
		let moduleName = moduleNames[moduleIndex]
		let identifiers = values.get(moduleName)
		return (identifiers || []).map(names => {
			let key = moduleName + ":" + names.join(".")
			key = JSON.stringify(key)
			let value = "_" + moduleIndex + names.map(name => `[${JSON.stringify(name)}]`).join("")
			return [key, value] as [string, string]
		}).sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)
	}

	if(taskDef.collectionType === "map" || taskDef.collectionType === "readonly_map"){
		exportValueStr = "["
		for(let i = 0; i < moduleNames.length; i++){
			joinSortAddKey(i).forEach(([k, v]) => {
				exportValueStr += `\n\t[${k},${v}],`
			})
		}
		exportValueStr += "\n]"
	} else if(taskDef.collectionType === "object" || taskDef.collectionType === "readonly_object"){
		exportValueStr = "{"
		for(let i = 0; i < moduleNames.length; i++){
			joinSortAddKey(i).forEach(([k, v]) => {
				exportValueStr += `\n\t${k}: ${v},`
			})
		}
		exportValueStr += "\n}"
	} else {
		exportValueStr = "["
		for(let i = 0; i < moduleNames.length; i++){
			joinSort(i).forEach(exportedName => {
				exportValueStr += `\n\t${exportedName},`
			})
		}
		exportValueStr += "\n]"
	}

	let exportTypeStr: string
	switch(taskDef.collectionType){
		case "array":
			exportTypeStr = taskDef.collectionValueType + "[]"
			break
		case "readonly_array":
			exportTypeStr = `ReadonlyArray<${taskDef.collectionValueType}>`
			break
		case "set":
			exportTypeStr = `Set<${taskDef.collectionValueType}>`
			exportValueStr = `new Set(${exportValueStr})`
			break
		case "readonly_set":
			exportTypeStr = `ReadonlySet<${taskDef.collectionValueType}>`
			exportValueStr = `new Set(${exportValueStr})`
			break
		case "object":
			exportTypeStr = `{[k: ${keyType}]: ${taskDef.collectionValueType}}`
			break
		case "readonly_object":
			exportTypeStr = `{readonly [k: ${keyType}]: ${taskDef.collectionValueType}}`
			break
		case "map":
			exportTypeStr = `Map<${keyType}, ${taskDef.collectionValueType}>`
			exportValueStr = `new Map(${exportValueStr} as [${keyType},${taskDef.collectionValueType}][])`
			break
		case "readonly_map":
			exportTypeStr = `ReadonlyMap<${keyType}, ${taskDef.collectionValueType}>`
			exportValueStr = `new Map(${exportValueStr} as [${keyType},${taskDef.collectionValueType}][])`
			break
		default:
			throw new Error("Collection type " + taskDef.collectionType + " is not valid.")
	}

	return `export const ${taskDef.exportedName}: ${exportTypeStr} = ${exportValueStr};`
}

interface ImportingTaskDefBase {
	additionalImports?: string[]
}

export function getImportStatementsText(moduleNames: string[], taskDef: ImportingTaskDefBase): string {
	let importStr = moduleNames.map((moduleName, i) => {
		return `import * as ${"_" + i} from "${moduleName}";`
	}).join("\n")

	if(taskDef.additionalImports){
		taskDef.additionalImports.forEach(importLine => {
			importStr += "\n" + importLine
		})
	}

	return importStr + "\n\n"
}