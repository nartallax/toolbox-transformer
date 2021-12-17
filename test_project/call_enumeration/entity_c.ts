import {registerEntity} from "call_enumeration/entity_repo"

// won't work as expected

!registerEntity("entity_c")

let x = registerEntity("entity_c")
void x

x = registerEntity("entity_c")

