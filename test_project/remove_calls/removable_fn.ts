export interface REMOVE_THIS_FUNCTION_CALL {}

export function logDebug(line: string): REMOVE_THIS_FUNCTION_CALL | undefined {
	console.error(line);
	return undefined;
}