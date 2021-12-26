import {test} from "@nartallax/clamsensor"
import {Imploder} from "@nartallax/imploder"
import {ToolboxTransformer} from "entrypoint"
import {promises as Fs} from "fs"
import * as Path from "path"

// TODO: test type arguments for pseudomethods

test("main test", async assert => {

	let testProjectGeneratedDir = Path.resolve("./test_project/generated")
	let outDir = Path.resolve("./test_project/js/main")
	await Fs.rm(testProjectGeneratedDir, {recursive: true, force: true})

	let config = JSON.parse(await Fs.readFile("./test_project/tsconfig.json", "utf-8"))
	if(config.compilerOptions.plugins[0].type === "program"){
		// when transformer is used as "imploder", it is started before first compile
		// and therefore is able to create this files himself
		// when transformer is used as "program", it cannot be started before first compile, as there is no program at the time
		// and the first compile won't happen because there are files absent
		// so, the only solution to have this files created manually
		// (in real project this will mean that users will have to create a file once and store it in version control)
		await Fs.mkdir(testProjectGeneratedDir, {recursive: true})
		await Fs.writeFile(Path.resolve(testProjectGeneratedDir, "calls_enumeration.ts"), "export = {}")
		await Fs.writeFile(Path.resolve(testProjectGeneratedDir, "page_list.ts"), "export const allThePages = [] as {new(): any}[]")
		await Fs.writeFile(Path.resolve(testProjectGeneratedDir, "flag_list.ts"), "export const allFlags = [] as symbol[]")
	}


	let context = await Imploder.runFromTsconfig("./test_project/tsconfig.json")
	if(!context.compiler.lastBuildWasSuccessful){
		throw new Error("Failed to build test project.")
	}

	{
		let file = await Fs.readFile(Path.resolve(testProjectGeneratedDir, "calls_enumeration.ts"), "utf-8")
		let moduleNames = file.match(/entity_./g) || []
		assert(moduleNames).equalsTo(["entity_a", "entity_b", "entity_d", "entity_e"])
	}

	{
		let file = await Fs.readFile(Path.resolve(testProjectGeneratedDir, "page_list.ts"), "utf-8")
		let enumeratedFiles = file.match(/\[.*\]/g) || []
		assert(enumeratedFiles).equalsTo(["[\"PageA\"]", "[\"Pages\"][\"Generated\"][\"Magic\"][\"PageC\"]", "[\"Pages\"][\"Generated\"][\"Magic\"][\"pageC2\"]", "[\"pageD\"]"])
	}

	{
		let file = await Fs.readFile(Path.resolve(testProjectGeneratedDir, "flag_list.ts"), "utf-8")
		let flags = file.match(/\[.*\]/g) || []
		assert(flags).equalsTo(["[\"flagA\"]", "[\"AllSymbols\"][\"Flags\"][\"flagC1\"]", "[\"AllSymbols\"][\"Flags\"][\"flagC2\"]"])
	}

	{
		let file = await Fs.readFile(Path.resolve(outDir, "pseudovars/build_props_usage.js"), "utf-8")
		assert(file).contains("1.3.3.7")
		assert(file).contains("pseudovars/build_props_usage")
	}

	{
		let file = await Fs.readFile(Path.resolve(outDir, "remove_calls/removable_fn_calls.js"), "utf-8")
		assert(file).notContains("logDebug")
	}

	{
		let file = await Fs.readFile(Path.resolve(outDir, "test_project_main.js"), "utf-8")
		assert(file).notContains(".obj.arr.exists(")
		assert(file).notContains("].sum(")
		assert(file).contains(".sum.call([")
		assert(file).contains(".exists.call(obj.arr")
	}

	{
		let file = await Fs.readFile(Path.resolve(testProjectGeneratedDir, "dto_source_list_map.ts"), "utf-8")
		assert(file).contains(`{
	"/typeof_type_map/dto:DtoTypes.OrderA": _0["DtoTypes"]["a"],
	"/typeof_type_map/dto:DtoTypes.OrderB": _0["dtoX"],
	"/typeof_type_map/dto:DtoTypes.OrderC": _1["dtoBase"],
	"/typeof_type_map/dto:OrderD": _0["DtoTypes"]["a"],
	"/typeof_type_map/dto:OrderE": _0["dtoX"],
	"/typeof_type_map/dto:OrderF": _1["dtoBase"],
	"/typeof_type_map/dto:OrderJ": _1["dtoBase"],
	"/typeof_type_map/dto:OrderL": null,
	"/typeof_type_map/dto_types:OrderH": _0["DtoTypes"]["a"],
	"/typeof_type_map/dto_types:OrderK": _0["dtoX"],
	"/typeof_type_map/dto_types:OrderL": _1["dtoBase"],
	"/typeof_type_map/dto_types:OrderM": _1["dtoBase"],
}`)
	}

	{
		let file = await Fs.readFile(Path.resolve(outDir, "decorate_methods/methods_to_be_decorated.js"), "utf-8")
		let line = file.split("\n").find(x => x.match(/\.methodTypes\(/))!
		assert(line).isTruthy()
		let arg = line.match(/\.methodTypes\((.*?)\)$/)![1]!
		assert(arg).isTruthy()
		let parsedArgsArr = eval(arg) as ToolboxTransformer.ParameterDescription[]
		assert(parsedArgsArr).equalsTo([
			{name: "_a", type: {type: "number"}},
			{name: "_b", type: {type: "object", properties: {id: {type: "number"}, logs: {type: "object", properties: {isLogs: {type: "constant", value: true}}}}}},
			{name: "_bb", type: {type: "tuple", valueTypes: [{type: "number"}, {type: "number"}, {type: "rest", valueType: {type: "string"}}]}},
			{name: "_bbb", type: {type: "tuple", valueTypes: [{type: "number"}, {type: "number"}]}},
			{name: "_bbbb", type: {type: "tuple", valueTypes: [{type: "number"}, {type: "number"}, {type: "string", optional: true}]}},
			{name: "_bbbbb", type: {type: "tuple", valueTypes: [{type: "number"}, {type: "number"}, {type: "string", optional: true}, {type: "rest", valueType: {type: "boolean"}}]}},
			{name: "_bbbbbb", type: {type: "tuple", valueTypes: [{type: "number"}, {type: "number"}, {type: "rest", valueType: {type: "string"}}, {type: "number"}]}},
			{name: "_bbbbbbb", type: {type: "tuple", valueTypes: [{type: "number"}, {type: "number"}]}},
			{name: "_bbbbbbbb", type: {type: "tuple", valueTypes: [{type: "number", optional: true}, {type: "number", optional: true}, {type: "rest", valueType: {type: "string"}}]}},
			{name: "_bbbbbbbbb", type: {type: "tuple", valueTypes: [{type: "number", optional: true}, {type: "number", optional: true}, {type: "rest", valueType: {type: "string"}}]}},
			{name: "_c", type: {type: "union", types: [{type: "string"}, {type: "constant_union", value: new Set([null, false])}]}},
			{name: "_cc", type: {type: "array", valueType: {type: "union", types: [{type: "number"}, {type: "string"}]}}},
			{name: "_ccc", type: {type: "array", valueType: {type: "union", types: [{type: "number"}, {type: "string"}]}}},
			{name: "_cccc", type: {type: "object", properties: {value: {type: "number"}}}},
			{name: "_ccccc", type: {type: "object", properties: {id: {type: "string"}}}},
			{name: "_cccccc", type: {type: "object", properties: {value: {type: "number"}}}},
			{name: "_ccccccc", type: {type: "object", properties: {a: {type: "number"}, b: {type: "string"}}}},
			{name: "_z", type: {type: "object", properties: {}, index: {valueType: {type: "number"}}}},
			{name: "_zz", type: {type: "object", properties: {a: {type: "number"}, b: {type: "number"}, c: {type: "number"}, d: {type: "number"}}}},
			{name: "_zzz", type: {type: "object", properties: {id: {type: "union", types: [{type: "number"}, {type: "constant", value: "niet"}], optional: true}, logs: {type: "union", types: [{type: "object", properties: {isLogs: {type: "constant", value: true}}}, {type: "constant", value: "niet"}], optional: true}}}},
			{name: "_zzzz", type: {type: "object", properties: {id: {type: "number"}, logs: {type: "object", properties: {isLogs: {type: "constant", value: true}}}, isGood: {type: "constant", value: true}, isGoodOrder: {type: "constant", value: true}}}},
			{name: "_zzzzz", type: {type: "object", properties: {id: {type: "union", types: [{type: "number"}, {type: "constant", value: "niet"}], optional: true}, logs: {type: "union", types: [{type: "object", properties: {isLogs: {type: "constant", value: true}}}, {type: "constant", value: "niet"}], optional: true}, isGood: {type: "constant_union", value: new Set([true, "niet"]), optional: true}, isGoodOrder: {type: "constant_union", value: new Set([true, "niet"]), optional: true}}}},
			{name: "_zzzzzz", type: {type: "object", properties: {id: {type: "union", types: [{type: "number"}, {type: "constant", value: "niet"}], optional: true}, logs: {type: "union", types: [{type: "object", properties: {isLogs: {type: "constant", value: true}}}, {type: "constant", value: "niet"}], optional: true}}}},
			{name: "_zzzzzzz", type: {type: "object", properties: {isLogs: {type: "constant_union", value: new Set([true, "niet"]), optional: true}}}},
			{name: "_e", type: {type: "external", name: "/decorate_methods/methods_to_be_decorated:ExternalOrder"}},
			{name: "_ee", type: {type: "external", name: "/decorate_methods/methods_to_be_decorated:ExternalOrderAsType"}},
			{name: "_d", type: {type: "union", types: [{type: "boolean"}, {type: "constant", value: "nope"}]}, optional: true},
			{name: "_f", type: {type: "union", types: [{type: "object", properties: {id: {type: "number"}}}, {type: "constant", value: true}]}, optional: true}
		])
	}

})