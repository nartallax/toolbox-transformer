import {FlagSymbol, makeFlagSymbol} from "value_enumeration/flag_symbol";

export namespace AllSymbols {
	export namespace Flags {
		export const flagC1 = makeFlagSymbol("flag_c1")
		export var flagC2: FlagSymbol;

		flagC2 = makeFlagSymbol("flag_c2");

		namespace NonExportedFlags {
			export const flagC3 = makeFlagSymbol("flag_c3")
		}

		void NonExportedFlags;
	}
}