// actual wording of imports here is important!
// when transformer will detect a pseudomethod, it will need to import real function code from somewhere
// and it deduces the path to module from this very imports
// so something like relative imports won't work well, as module paths are used as-is
import {exists, PSEUDOMETHOD} from "pseudomethod/pseudomethods";
import * as PmLib from "pseudomethod/pseudomethods";

// adding fields to global interfaces here
declare global {
	interface Array<T> {
		// pseudomethods must be referenced exactly like this
		// marker interface that has exactly one type parameter, and it's value is `typeof real_function_to_call`
		exists: PSEUDOMETHOD<typeof exists>
		// some nesting is allowed in function reference
		sum: PSEUDOMETHOD<typeof PmLib.ArrayMathFunctions.sum>
	}
}

// explicitly exporting nothing just to force this file to be a module
// otherwise `declare global` won't work as well
export {}