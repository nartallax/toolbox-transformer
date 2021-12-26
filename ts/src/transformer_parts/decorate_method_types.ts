import {SubTransformer, SubTransformerTransformParams} from "main_transformer"
import {DecorateMethodTypesTaskDef} from "transformer_config"
import * as Tsc from "typescript"
import * as Path from "path"
import {arrayToPropertyAccessChain, createLiteralOfValue, declarationExtendsMarker, isNodeAbstract, typeHasMarker} from "tsc_tricks"
import {ToolboxTransformer} from "entrypoint"
import {addModuleObjectImportsToSourceFile, getReferenceToDeclaration} from "transformer_tricks"


export class DecorateMethodTypesTransformer implements SubTransformer {

	toString(): string {
		return "DecorateMethodTypes"
	}

	constructor(private readonly tasks: DecorateMethodTypesTaskDef[]) {}


	onModuleDelete(): void {
		// nothing
	}

	transform(params: SubTransformerTransformParams): Tsc.SourceFile {
		let modulesToImport = new Map<string, string>()
		let modifyClass = (classNode: Tsc.ClassDeclaration, task: DecorateMethodTypesTaskDef): Tsc.ClassDeclaration => {
			if(task.skipAbstractClasses && isNodeAbstract(Tsc, classNode)){
				return classNode
			}

			return Tsc.visitEachChild(classNode, node => {
				if(!Tsc.isMethodDeclaration(node)){
					return node
				}

				let parameterDescriptionList = node.parameters.map(param => {
					return new ParameterDescriber(
						params, task, classNode, node, param
					).describe()
				})

				let moduleObjName = modulesToImport.get(task.importDecoratorFrom)
				if(!moduleObjName){
					moduleObjName = "method_decorator_" + Math.floor(Math.random() * 0xffffffff)
					modulesToImport.set(task.importDecoratorFrom, moduleObjName)
				}

				let expr = arrayToPropertyAccessChain(Tsc, [moduleObjName, task.decoratorName])

				let decorator = Tsc.factory.createDecorator(
					Tsc.factory.createCallExpression(
						expr,
						undefined,
						[createLiteralOfValue(Tsc, parameterDescriptionList)]
					)
				)

				return Tsc.factory.updateMethodDeclaration(node, [
					...node.decorators || [],
					decorator
				], node.modifiers, node.asteriskToken, node.name, node.questionToken, node.typeParameters, node.parameters, node.type, node.body)

			}, params.transformContext)
		}

		let visitor = (node: Tsc.Node): Tsc.VisitResult<Tsc.Node> => {
			if(Tsc.isModuleDeclaration(node) && node.body){
				return Tsc.visitEachChild(node.body, subnode => visitor(subnode), params.transformContext)
			}

			if(Tsc.isClassDeclaration(node)){
				let clsNode = node
				this.tasks.forEach(task => {
					if(declarationExtendsMarker(Tsc, params.typechecker, clsNode, task.markerName)){
						node = clsNode = modifyClass(clsNode, task)
					}
				})
			}

			return node
		}

		let result = Tsc.visitEachChild(params.file, node => visitor(node), params.transformContext)
		result = addModuleObjectImportsToSourceFile(result, modulesToImport)
		return result
	}
}

type TypeArgsMap = Map<string, ToolboxTransformer.TypeDescription> | undefined

class TypeDescriber {

	protected usedDeclarations = new Set<Tsc.Declaration>()

	constructor(
		protected readonly params: SubTransformerTransformParams,
		protected readonly externalTypes?: ReadonlyArray<string>
	) {}

	protected fail(msg: string, node?: Tsc.Node): never {
		throw new Error(msg + (node?.getText() ?? ""))
	}

	// we kinda have to traverse original definitions and not just types
	// types have not the best api
	// (for instance, you cannot get `rest` type of tuple if present)
	// (or you cannot distinguish literal `true` and literal `false` types)
	describeType(node: Tsc.TypeNode, typeArgs: TypeArgsMap): ToolboxTransformer.TypeDescription {
		if(Tsc.isParenthesizedTypeNode(node)){
			return this.describeType(node.type, typeArgs)
		} else if(Tsc.isLiteralTypeNode(node)){
			return this.describeLiteralType(node)
		} else if(node.kind === Tsc.SyntaxKind.NumberKeyword){
			return {type: "number"}
		} else if(node.kind === Tsc.SyntaxKind.StringKeyword){
			return {type: "string"}
		} else if(node.kind === Tsc.SyntaxKind.BooleanKeyword){
			return {type: "boolean"}
		} else if(Tsc.isUnionTypeNode(node)){
			return this.describeUnionType(node, typeArgs)
		} else if(Tsc.isIntersectionTypeNode(node)){
			return {
				type: "intersection",
				types: node.types.map(type => this.describeType(type, typeArgs))
			}
		} else if(Tsc.isArrayTypeNode(node)){
			return {type: "array", valueType: this.describeType(node.elementType, typeArgs)}
		} else if(Tsc.isTypeLiteralNode(node)){
			return this.describeObjectType(node, typeArgs)
		} else if(Tsc.isTupleTypeNode(node)){
			return this.describeTupleType(node, typeArgs)
		} else if(Tsc.isTypeReferenceNode(node)){
			return this.describeTypeReference(node, typeArgs)
		} else if(Tsc.isExpressionWithTypeArguments(node)){
			return this.describeExpressionWithTypeArgs(node, typeArgs)
		} else if(Tsc.isIndexedAccessTypeNode(node)){
			return this.describeIndexAccessType(node, typeArgs)
		} else if(Tsc.isMappedTypeNode(node)){
			return this.describeMappedType(node, typeArgs)
		} else if(Tsc.isTypeOperatorNode(node) && node.operator === Tsc.SyntaxKind.KeyOfKeyword){
			return this.describeKeyofType(node, typeArgs)
		} else if(Tsc.isTypeQueryNode(node)){
			return this.describeTypeofType(node)
		} else {
			this.fail("Cannot understand what this node is exactly: " + node.getText() + ", kind = " + Tsc.SyntaxKind[node.kind])
		}

	}

	private describeLiteralType(node: Tsc.LiteralTypeNode): ToolboxTransformer.TypeDescription {
		let literal = node.literal
		if(Tsc.isStringLiteral(literal)){
			return {type: "constant", value: literal.text}
		} else if(Tsc.isNumericLiteral(literal)){
			let num = parseFloat(literal.text)
			if(Number.isNaN(num)){
				this.fail("Failed to parse number value of numeric literal ", node)
			}
			return {type: "constant", value: num}
		} else if(literal.kind === Tsc.SyntaxKind.NullKeyword){
			return {type: "constant", value: null}
		} else if(literal.kind === Tsc.SyntaxKind.TrueKeyword){
			return {type: "constant", value: true}
		} else if(literal.kind === Tsc.SyntaxKind.FalseKeyword){
			return {type: "constant", value: false}
		} else {
			this.fail("Cannot understand type of literal type expression: ", node)
		}
	}

	private describeTypeofType(node: Tsc.TypeQueryNode): ToolboxTransformer.TypeDescription {
		let symbol = this.params.typechecker.getSymbolAtLocation(node.exprName)
		let decls = symbol?.declarations
		if(!decls || decls.length > 1){
			this.fail("Expected symbol in typeof to have exactly one declaration: ", node)
		}
		let decl = decls[0]!
		if(Tsc.isVariableDeclaration(decl) || Tsc.isParameter(decl) || Tsc.isPropertySignature(decl)){
			let type = decl.type
			if(!type){
				this.fail("Cannot describe target of typeof: it has no explicit type: ", node)
			}
			return this.describeType(type, undefined)
		} else {
			this.fail("Cannot deduce type of typeof argument: it points to unexpected location: ", node)
		}
	}

	private describeKeyofType(node: Tsc.TypeOperatorNode, typeArgs: TypeArgsMap): ToolboxTransformer.TypeDescription {
		let target = this.describeType(node.type, typeArgs)
		if(target.type !== "object"){
			this.fail("Cannot describe keyof of non-object type: ", node)
		}
		if(target.index){
			return {type: "string"}
		} else {
			return {
				type: "constant_union",
				value: new Set(Object.keys(target.properties))
			}
		}
	}

	// here we are unwrapping mapped type, making it look just like ordinary object
	// it's not the best idea in terms of performance, but it's need to be done
	// I don't want to include such difficult concept into type description structure
	private describeMappedType(node: Tsc.MappedTypeNode, typeArgs: TypeArgsMap): ToolboxTransformer.TypeDescription {
		// main idea is to iterate over key union,
		// each time placing value of key as constant type into type args
		// and resolve type for that key
		// see also describeIndexAccessType()
		let keyType = Tsc.getEffectiveConstraintOfTypeParameter(node.typeParameter)
		if(!keyType){
			this.fail("Cannot describe mapped type: key is not constrained: ", node)
		}

		let valueType = node.type
		if(!valueType){
			this.fail("Cannot describe mapped type: no value type: ", node)
		}

		let keyTypeDescr = this.describeType(keyType, typeArgs)
		let keyValues: Iterable<unknown>
		if(keyTypeDescr.type === "constant_union"){
			keyValues = keyTypeDescr.value
		} else if(keyTypeDescr.type === "constant"){
			// rare occasion
			keyValues = [keyTypeDescr.value]
		} else {
			this.fail("Cannot describe mapped type: key type is not union: " + JSON.stringify(keyTypeDescr) + " for type ", node)
		}

		let keyTypeName = node.typeParameter.name.text
		let oldArgVal = typeArgs?.get(keyTypeName)

		let result: ToolboxTransformer.ObjectTypeDescription = {
			type: "object",
			properties: {}
		}

		let typeArgsMap: Map<string, ToolboxTransformer.TypeDescription> = typeArgs || new Map()
		for(let keyTypeValue of keyValues){
			if(typeof(keyTypeValue) !== "string"){
				this.fail("Cannot describe mapped type: key " + keyTypeValue + " is not a string: ", node)
			}
			typeArgsMap.set(keyTypeName, {type: "constant", value: keyTypeValue})
			result.properties[keyTypeValue] = this.describeType(valueType, typeArgsMap)
			if(node.questionToken){
				result.properties[keyTypeValue].optional = true
			}
		}

		if(typeArgs && oldArgVal){
			typeArgs.set(keyTypeName, oldArgVal)
		}

		return result
	}

	private describeIndexAccessType(node: Tsc.IndexedAccessTypeNode, typeArgs: TypeArgsMap): ToolboxTransformer.TypeDescription {
		let objType = this.describeType(node.objectType, typeArgs)
		let indType = this.describeType(node.indexType, typeArgs)
		if(indType.type !== "constant" || typeof(indType.value) !== "string"){
			this.fail("Indexed access types are expected to get constant index value at resolve-time: ", node)
		}
		if(objType.type !== "object"){
			this.fail("Indexed access types are expected be based on objects: ", node)
		}
		let prop = objType.properties[indType.value]
		if(!prop){
			this.fail("Base object does not have property " + indType.value + ": ", node)
		}
		return prop
	}

	// note that produced union is always as flat as possible
	private describeUnionType(node: Tsc.UnionTypeNode, typeArgs: TypeArgsMap): ToolboxTransformer.TypeDescription {
		// optimize here? no need to create type descriptions for constant types
		// because we will just throw them away
		if(node.types.length === 1){
			return this.describeType(node.types[0]!, typeArgs)
		}

		let otherTypes = [] as ToolboxTransformer.TypeDescription[]
		let constValues = [] as unknown[]

		function addType(type: ToolboxTransformer.TypeDescription) {
			if(type.type === "constant"){
				constValues.push(type.value)
			} else if(type.type === "constant_union"){
				constValues.push(...type.value)
			} else if(type.type === "union"){
				type.types.forEach(addType)
			} else {
				otherTypes.push(type)
			}
		}

		for(let type of node.types){
			addType(this.describeType(type, typeArgs))
		}

		if(constValues.length < 2){
			if(constValues.length > 0){
				otherTypes.push({type: "constant", value: constValues[0]!})
			}
			return {type: "union", types: otherTypes}
		}

		let constUnion: ToolboxTransformer.ConstantUnionTypeDescription = {
			type: "constant_union",
			value: new Set(constValues)
		}

		if(otherTypes.length === 0){
			return constUnion
		}

		otherTypes.push(constUnion)
		return {
			type: "union",
			types: otherTypes
		}
	}

	private describeReferencedDeclarationType(reference: Tsc.NodeWithTypeArguments, decl: Tsc.Declaration, typeArgs: TypeArgsMap): ToolboxTransformer.TypeDescription {
		if(this.usedDeclarations.has(decl)){
			this.fail("Recursive declarations cannot be converted to type description: ", decl)
		}

		this.usedDeclarations.add(decl)

		try {
			if(Tsc.isClassDeclaration(decl)){
				this.fail("Class type can not be described: ", reference)
			} else if(Tsc.isTypeParameterDeclaration(decl)){
				let typeArg = typeArgs?.get(decl.name.text)
				if(!typeArg && decl.default){
				// should I really pass typeArgs here?
				// or should it be something else?
					typeArg = this.describeType(decl.default, typeArgs)
				}
				if(!typeArg){
					this.fail("Can't resolve type of type parameter: ", reference)
				}
				return typeArg
			} else if(Tsc.isInterfaceDeclaration(decl)){
				let newTypeArgs = this.makeTypeArgMap(reference, decl, typeArgs)
				let result: ToolboxTransformer.ObjectTypeDescription = {type: "object", properties: {}}
				if(decl.heritageClauses){
					for(let clause of decl.heritageClauses){
						for(let heritage of clause.types){
							let type = this.describeType(heritage, newTypeArgs)
							if(type.type !== "object"){
								this.fail("Expected interface to inherit only object-like types: ", reference)
							}
							result.index = type.index || result.index
							result.properties = {
								...result.properties,
								...type.properties
							}
						}
					}
				}
				if(result.index === undefined){
					delete result.index
				}

				return this.describeObjectType(decl, newTypeArgs, result)
			} else if(Tsc.isTypeAliasDeclaration(decl)){
				let newTypeArgs = this.makeTypeArgMap(reference, decl, typeArgs)
				return this.describeType(decl.type, newTypeArgs)
			} else if(Tsc.isEnumDeclaration(decl)){
				this.fail("Enum types are not supported, at least yet: ", reference)
			} else {
				this.fail("Can't understand type of declaration: ", reference)
			}
		} finally {
			this.usedDeclarations.delete(decl)
		}
	}

	private describeExpressionWithTypeArgs(node: Tsc.ExpressionWithTypeArguments, typeArgs: TypeArgsMap): ToolboxTransformer.TypeDescription {
		let symbol = this.params.typechecker.getSymbolAtLocation(node.expression)
		return this.describeNodeBySymbol(node, symbol, typeArgs)
	}

	private describeTypeReference(node: Tsc.TypeReferenceNode, typeArgs: TypeArgsMap): ToolboxTransformer.TypeDescription {
		let symbol = this.params.typechecker.getSymbolAtLocation(node.typeName)
		return this.describeNodeBySymbol(node, symbol, typeArgs)
	}

	private tryDescribeExternalNode(node: Tsc.TypeNode, symbol: Tsc.Symbol): ToolboxTransformer.TypeDescription | null {
		let type = this.params.typechecker.getDeclaredTypeOfSymbol(symbol)
		if(!type){
			this.fail("Node's symbol has no type: ", node)
		}
		let marker = this.externalTypes?.find(marker => !!typeHasMarker(
			Tsc, this.params.typechecker, type, marker
		))
		if(!marker){
			return null
		}

		let decls = symbol.getDeclarations()
		if(!decls || decls.length > 1){
			throw new Error("Found marker " + marker + " on node " + node.getText() + ", but declarations are absent or too many. Expected exactly one declaration.")
		}
		let decl = decls[0]!
		if(!Tsc.isClassDeclaration(decl) && !Tsc.isInterfaceDeclaration(decl) && !Tsc.isTypeAliasDeclaration(decl)){
			throw new Error("Found marker " + marker + " on node " + node.getText() + ", but it's not class, interface or type alias. Don't know how to handle it.")
		}
		let {ref} = getReferenceToDeclaration(this.params, decl)

		return {
			type: "external", name: ref.moduleName + ":" + ref.identifiers.join(".")
		}
	}

	private describeNodeBySymbol(node: Tsc.NodeWithTypeArguments, symbol: Tsc.Symbol | undefined, typeArgs: TypeArgsMap): ToolboxTransformer.TypeDescription {
		if(!symbol){
			this.fail("Node has no symbol: ", node)
		}

		let externalType = this.tryDescribeExternalNode(node, symbol)
		if(externalType){
			return externalType
		}

		let decls = symbol.getDeclarations() || []
		if(decls.length === 0){
			this.fail("Node has no declarations: ", node)
		}

		let isLibType = !!decls.find(decl => {
			// not the best way to do it, but whatever
			let pathParts = decl.getSourceFile().fileName.split(Path.sep)
			return pathParts.find(x => x === "node_modules")
		})

		if(isLibType){
			if(symbol.getName() === "Array" || symbol.getName() === "ReadonlyArray"){
				let valueType = (node.typeArguments || [])[0]
				if(!valueType){
					this.fail("Array must have type argument: ", node)
				}
				return {type: "array", valueType: this.describeType(valueType, typeArgs)}
			}

			this.fail("Most of builtin/library values cannot/won't be converted to type description: ", node)
		}

		if(decls.length > 1){
			this.fail("Multiple declarations are not supported: ", node)
		}

		return this.describeReferencedDeclarationType(node, decls[0]!, typeArgs)
	}

	private makeTypeArgMap(node: Tsc.NodeWithTypeArguments, decl: Tsc.InterfaceDeclaration | Tsc.TypeAliasDeclaration, oldTypeArgMap: TypeArgsMap): TypeArgsMap {
		if(!node.typeArguments || node.typeArguments.length === 0){
			return undefined
		}

		let typeParams = decl.typeParameters || []
		let result: Map<string, ToolboxTransformer.TypeDescription> = new Map()
		node.typeArguments.forEach((arg, argIndex) => {
			let param = typeParams[argIndex]
			if(!param){
				this.fail("Cannot convert type arguments list to map: no matching parameter for argument at index " + argIndex + ": " + node)
			}
			result.set(param.name.text, this.describeType(arg, oldTypeArgMap))
		})
		return result
	}

	private describeTupleType(node: Tsc.TupleTypeNode, typeArgs: TypeArgsMap): ToolboxTransformer.TypeDescription {
		return {type: "tuple", valueTypes: node.elements.map(el => {
			let result: ToolboxTransformer.TupleElementTypeDescription
			if(Tsc.isNamedTupleMember(el)){
				result = this.describeType(el.type, typeArgs)
				if(el.questionToken){
					result.optional = true
				} else if(el.dotDotDotToken){
					if(result.type !== "array"){
						// not gonna happen, typescript enforces it
						this.fail("Rest tuple element must have array type")
					}
					result = {
						type: "rest",
						valueType: result.valueType
					}
				}
			} else {
				let optional = false
				if(Tsc.isOptionalTypeNode(el)){
					optional = true
					el = el.type
				}
				if(Tsc.isRestTypeNode(el)){
					let nestedType = this.describeType(el.type, typeArgs)
					if(nestedType.type !== "array"){
						// not gonna happen, typescript enforces it
						this.fail("Rest tuple element must have array type")
					}
					result = {
						type: "rest",
						valueType: nestedType.valueType
					}
				} else {
					result = this.describeType(el, typeArgs)
					if(optional){
						result.optional = true
					}
				}
			}
			return result
		})}
	}

	private describeObjectType(node: Tsc.TypeLiteralNode | Tsc.InterfaceDeclaration, typeArgs: TypeArgsMap, base?: ToolboxTransformer.ObjectTypeDescription): ToolboxTransformer.TypeDescription {
		let result = base || {
			type: "object",
			properties: {}
		}
		node.members.forEach(member => {
			if(Tsc.isIndexSignatureDeclaration(member)){
				if(result.index){
					this.fail("More than one index signature is not supported: ", node)
				}
				if(member.parameters.length !== 1){
					// enforced by typescript
					this.fail("Index signatures must have exactly one parameter: ", node)
				}
				let param = member.parameters[0]!
				let keyType = param.type
				if(!keyType){
					this.fail("Index signatures must have explicit type: ", node)
				}
				let keyTypeDescr = this.describeType(keyType, typeArgs)
				if(keyTypeDescr.type !== "string"){
					this.fail("Only string index is allowed: ", node)
				}
				let valueTypeDescr = this.describeType(member.type, typeArgs)
				result.index = {valueType: valueTypeDescr}
				return
			}

			if(!Tsc.isPropertySignature(member)){
				this.fail("Cannot process object type members: ", node)
			}

			let name = member.name
			if(!name){
				this.fail("Type literal' property does not have name, how is this possible? ", node)
			}

			let nameStr: string
			if(Tsc.isIdentifier(name)
					|| Tsc.isPrivateIdentifier(name)
					|| Tsc.isStringLiteral(name)
					|| Tsc.isNumericLiteral(name)){
				nameStr = name.text
			} else {
				this.fail("Computed property names can not be described as type: ", node)
			}

			let type = member.type
			if(!type){
				this.fail("Expected all object properties to be explicitly typed, but this is not: ", member)
			}

			result.properties[nameStr] = this.describeType(type, typeArgs)
			if(member.questionToken){
				result.properties[nameStr].optional = true
			}
		})
		return result
	}

}

class ParameterDescriber extends TypeDescriber {
	constructor(
		params: SubTransformerTransformParams,
		task: DecorateMethodTypesTaskDef,
		private readonly classNode: Tsc.ClassDeclaration,
		private readonly methodNode: Tsc.MethodDeclaration,
		private readonly paramNode: Tsc.ParameterDeclaration
	) {
		super(params, task.externalTypes)
	}

	describe(): ToolboxTransformer.ParameterDescription {
		let nameIdentifier = this.paramNode.name
		if(!Tsc.isIdentifier(nameIdentifier)){
			// is this even possible
			this.fail("Cannot decorate method: no destructurization allowed: " + this.paramNode.getText())
		}
		let paramName = nameIdentifier.text

		let type = this.paramNode.type
		if(!type){
			this.fail("Explicit types are required on parameters")
		}

		let result: ToolboxTransformer.ParameterDescription = {
			name: paramName,
			type: this.describeType(type, undefined)
		}
		if(this.paramNode.questionToken){
			result.optional = true
		}
		return result
	}

	protected fail(msg: string, node?: Tsc.Node): never {
		let paramPart = "parameter name = " + this.paramNode.name.getText()
		let methodPart = "method name = " + this.methodNode.name.getText()
		let classPart = "class name = " + (this.classNode.name?.getText() ?? "<unknown>")
		let locationPostfix = `; ${classPart}, ${methodPart}, ${paramPart}`
		throw new Error(msg + (node?.getText() ?? "") + locationPostfix)
	}

}