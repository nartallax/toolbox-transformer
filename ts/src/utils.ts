import {CollectTaskCollectionType} from "transformer_config";

/** Are two sets equal? */
export function setsEqual<T>(a: Set<T>, b: Set<T>): boolean {
	if(a.size !== b.size){
		return false
	}

	for(let item of a){
		if(!b.has(item)){
			return false;
		}
	}

	return true;
}

interface ExportingTaskDefBase {
	collectionValueType: string;
	collectionType: CollectTaskCollectionType;
	exportedName: string;
}

export function getExportStatementText(moduleNames: string[], taskDef: ExportingTaskDefBase, modules: Map<string, string[][]>): string {
	let exportTypeStr: string;
		let exportValueStr = "[";
		moduleNames.forEach((moduleName, i) => {
			(modules.get(moduleName) || []).map(names => {
				return names.map(name => `[${JSON.stringify(name)}]`).join("")
			})
			.sort()
			.forEach(exportedName => {
				exportValueStr += `\n\t${"_" + i}${exportedName},`
			});
		});
		exportValueStr += "\n]";

		switch(taskDef.collectionType){
			case "array":
				exportTypeStr = taskDef.collectionValueType + "[]"
				break;
			case "readonly_array":
				exportTypeStr = `ReadonlyArray<${taskDef.collectionValueType}>`
				break;
			case "set":
				exportTypeStr = `Set<${taskDef.collectionValueType}>`
				exportValueStr = `new Set(${exportValueStr})`
				break;
			case "readonly_set":
				exportTypeStr = `ReadonlySet<${taskDef.collectionValueType}>`
				exportValueStr = `new Set(${exportValueStr})`
				break;
			default:
				throw new Error("Collection type " + taskDef.collectionType + " is not valid.");
		}
		
		return `export const ${taskDef.exportedName}: ${exportTypeStr} = ${exportValueStr};`
}