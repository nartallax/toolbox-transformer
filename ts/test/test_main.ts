import {test} from "@nartallax/clamsensor"
import {Imploder} from "@nartallax/imploder"
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

})