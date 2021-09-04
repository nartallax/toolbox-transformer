export interface FLAG_SYMBOL_TO_COLLECT {}

export type FlagSymbol = Symbol & FLAG_SYMBOL_TO_COLLECT;

export function makeFlagSymbol(name: string): FlagSymbol {
	return Symbol(name);
}