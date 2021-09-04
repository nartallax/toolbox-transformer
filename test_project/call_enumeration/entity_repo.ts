export interface ENUMERATE_THIS_RETURN_TYPE {}

export const entityRepo = [] as string[];

export function registerEntity(name: string): ENUMERATE_THIS_RETURN_TYPE | undefined {
	entityRepo.push(name);
	return undefined
}