import {DtoByFields, DtoTypes, dtoX} from "typeof_type_map/dto"
import {dtoBase as base} from "typeof_type_map/dto_values"

export type OrderH = DtoByFields<typeof DtoTypes.a>
export type OrderK = DtoTypes.NestedDtoByFields<typeof dtoX>
export type OrderL = DtoTypes.NestedDtoByFields<typeof base>
export interface OrderM extends DtoByFields<typeof base> {}