import {logDebug} from "remove_calls/removable_fn"

export function doSomething(): void {
	logDebug("Doing something!")
	process.exit(1)
}