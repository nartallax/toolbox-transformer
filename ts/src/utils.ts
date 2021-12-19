import {CollectTaskCollectionType} from "transformer_config"

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

interface SequenceExportingTaskDefBase {
	collectionValueType: string
	collectionType: CollectTaskCollectionType
	exportedName: string
}

export function getSequenceExportStatementText(moduleNames: string[], taskDef: SequenceExportingTaskDefBase, modules: Map<string, string[][]>): string {
	let exportTypeStr: string
	let exportValueStr = "["
	moduleNames.forEach((moduleName, i) => {
		(modules.get(moduleName) || []).map(names => {
			return names.map(name => `[${JSON.stringify(name)}]`).join("")
		})
			.sort()
			.forEach(exportedName => {
				exportValueStr += `\n\t${"_" + i}${exportedName},`
			})
	})
	exportValueStr += "\n]"

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