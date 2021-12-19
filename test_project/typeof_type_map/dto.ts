import * as DtoValues from "typeof_type_map/dto_values"

export interface DTO_MARKER_TYPE {}
export type DtoByFields<T> = {value: T} & DTO_MARKER_TYPE

export namespace DtoTypes {
    export type NestedDtoByFields<T> = {value: T} & DTO_MARKER_TYPE
	export type OrderA = DtoByFields<typeof a>
	export type OrderB = NestedDtoByFields<typeof dtoX>
	export type OrderC = NestedDtoByFields<typeof DtoValues.dtoBase>
    export const [{z: a}, b] = [{z: 1},2]
}

export type OrderD = DtoByFields<typeof DtoTypes.a>
export type OrderE = DtoTypes.NestedDtoByFields<typeof dtoX>
export type OrderF = DtoTypes.NestedDtoByFields<typeof DtoValues.dtoBase>

type OrderJ = DtoTypes.NestedDtoByFields<typeof DtoValues.dtoBase>
let y = null as unknown as OrderJ;
void y

export const dtoX = 5

const dtoY = 10
export type OrderL = DtoByFields<typeof dtoY>