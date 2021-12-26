import {ToolboxTransformer} from "entrypoint"
import {SubTransformer, SubTransformerTransformParams} from "main_transformer"
import {CollectTypeofTypeMapTaskDef, ToolboxTransformerConfig} from "transformer_config"
import * as Path from "path"
import * as Tsc from "typescript"
import {entityNameToArray, isNodeExported, typeHasMarker} from "tsc_tricks"
import {getImportStatementsText, setsEqual} from "utils"
import {NodeReference, getVariableReferenceByName, writeGeneratedFile} from "transformer_tricks"

interface TargetType {
	pathToType: string[]
	value: NodeReference
}

interface ModulesOfTask {
	modules: Map<string, TargetType[]>
	def: CollectTypeofTypeMapTaskDef
}

export class TypeofTypeMapTransformer implements SubTransformer {

	toString(): string {
		return "TypeofTypeMap"
	}

	constructor(
		tasks: CollectTypeofTypeMapTaskDef[],
		private readonly toolboxContext: ToolboxTransformer.TransformerProjectContext<ToolboxTransformerConfig>) {

		this.tasks = tasks.map(task => {
			task.file = Path.resolve(Path.dirname(toolboxContext.tsconfigPath), task.file)
			return {
				def: task,
				modules: new Map()
			}
		})

		this.tasks.forEach(task => this.generateFile(task))
	}

	private readonly tasks: ModulesOfTask[]

	onModuleDelete(moduleName: string): void {
		this.tasks.forEach(task => {
			if(task.modules.has(moduleName)){
				task.modules.delete(moduleName)
				this.generateFile(task)
			}
		})
	}

	transform(params: SubTransformerTransformParams): Tsc.SourceFile {
		// task index -> exported names
		let exportedValueNames = this.tasks.map(() => [] as TargetType[])

		let tryProcessType = (node: Tsc.InterfaceDeclaration | Tsc.TypeAliasDeclaration, type: Tsc.TypeNode, namePath: ReadonlyArray<string>, exported: boolean) => {
			if(!(Tsc.isExpressionWithTypeArguments(type) || Tsc.isTypeReferenceNode(type)) || !type.typeArguments){
				return
			}

			const firstTypeArg = type.typeArguments[0]
			if(!firstTypeArg || !Tsc.isTypeQueryNode(firstTypeArg)){
				return
			}

			let typeOfType = params.typechecker.getTypeAtLocation(type)
			this.tasks.forEach((task, taskIndex) => {
				if(task.def.exportedTypesOnly && !exported){
					return
				}

				if(!typeHasMarker(Tsc, params.typechecker, typeOfType, task.def.markerName)){
					return
				}

				let fullPathToType = [...namePath, node.name.getText()]
				let valueRef = getVariableReferenceByName(params, firstTypeArg.exprName)
				if(!valueRef){
					throw new Error("Cannot refer to value " + entityNameToArray(Tsc, firstTypeArg.exprName).join(".") + " mentioned in module " + params.moduleName + " as " + fullPathToType.join(".") + ". Maybe the value is not exported?")
				}
				exportedValueNames[taskIndex].push({
					pathToType: fullPathToType,
					value: valueRef
				})
			})
		}

		let visitor = (node: Tsc.Node, namePath: string[], exported: boolean): Tsc.VisitResult<Tsc.Node> => {
			exported = exported && isNodeExported(Tsc, node)

			if(Tsc.isTypeAliasDeclaration(node)){
				tryProcessType(node, node.type, namePath, exported)
			} else if(Tsc.isInterfaceDeclaration(node)){
				if(node.heritageClauses){
					for(let clause of node.heritageClauses){
						clause.types.forEach(type => {
							tryProcessType(node, type, namePath, exported)
						})
					}
				}
			} else if(Tsc.isModuleDeclaration(node)){
				if(node.body){
					Tsc.visitEachChild(node.body, subnode => visitor(subnode, [...namePath, node.name.text], exported), params.transformContext)
				}
			}

			return node
		}

		Tsc.visitEachChild(params.file, node => visitor(node, [], true), params.transformContext)

		this.tasks.forEach((task, taskIndex) => {
			let newList = exportedValueNames[taskIndex]
			let oldList = task.modules.get(params.moduleName)
			if(newList.length > 0){
				if(!oldList || !this.moduleValuesEquals(newList, oldList)){
					task.modules.set(params.moduleName, newList)
					this.generateFile(task)
				}
			} else if(oldList){
				task.modules.delete(params.moduleName)
				this.generateFile(task)
			}
		})

		return params.file
	}

	private moduleValuesEquals(a: TargetType[], b: TargetType[]): boolean {
		function typeToStr(target: TargetType): string {
			let valuePath = target.value.moduleName + ":" + target.value.identifiers.join(".")
			return target.pathToType.join("") + "=" + valuePath
		}

		return setsEqual(new Set(a.map(typeToStr)), new Set(b.map(typeToStr)))
	}

	private generateFile(task: ModulesOfTask): void {
		let importedModules = [] as string[]
		task.modules.forEach(targets => targets.forEach(target => {
			importedModules.push(target.value.moduleName)
		}))
		importedModules = [...new Set(importedModules)].sort()
		let importedModuleMap = new Map(importedModules.map((x, i) => [x, i]))

		let importStr = getImportStatementsText(importedModules, task.def)

		let KVs = new Map<string, string>()
		task.modules.forEach((targets, typeModuleName) => targets.forEach(target => {
			let key = typeModuleName + ":" + target.pathToType.join(".")
			key = JSON.stringify(key)

			let identifierStr = target.value.identifiers
				.map(x => "[" + JSON.stringify(x) + "]")
				.join("")
			let moduleIndex = importedModuleMap.get(target.value.moduleName)!
			let value = "_" + moduleIndex + identifierStr

			if(KVs.has(key)){
				throw new Error("More than one value is present for identifier " + key)
			}
			KVs.set(key, value)
		}))

		let KVarr = [...KVs.entries()]
			.sort((a, b) => a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1)

		let exportTypeStr: string
		let exportValueStr: string

		if(task.def.collectionType === "object" || task.def.collectionType === "readonly_object"){
			exportValueStr = "{"
			KVarr.forEach(([key, value]) => {
				exportValueStr += `\n\t${key}: ${value},`
			})
			exportValueStr += "\n}"
		} else {
			exportValueStr = "["
			KVarr.forEach(([key, value]) => {
				exportValueStr += `\n\t[${key}, ${value}],`
			})
			exportValueStr += "\n]"
		}

		let keyType = "string"
		let itemType = task.def.collectionValueType || "unknown"
		switch(task.def.collectionType){
			case "object":
				exportTypeStr = `{[k: ${keyType}]: ${itemType}}`
				break
			case "readonly_object":
				exportTypeStr = `{readonly [k: ${keyType}]: ${itemType}}`
				break
			case "map":
				exportTypeStr = `Map<${keyType}, ${itemType}>`
				exportValueStr = `new Map(${exportValueStr} as [${keyType},${itemType}][])`
				break
			case "readonly_map":
				exportTypeStr = `ReadonlyMap<${keyType}, ${itemType}>`
				exportValueStr = `new Map(${exportValueStr} as [${keyType},${itemType}][])`
				break
			default:
				throw new Error("Collection type " + task.def.collectionType + " is not valid.")
		}

		let exportStr = `export const ${task.def.exportedName}: ${exportTypeStr} = ${exportValueStr};`

		writeGeneratedFile(this.toolboxContext, task.def.file, importStr + exportStr)
	}

}