import {entityRepo} from "call_enumeration/entity_repo";
import "generated/calls_enumeration";
import "classes_enumeration/page";
import {allThePages} from "generated/page_list";

export function main(){
	console.log(entityRepo);
	console.log(allThePages.map(x => new x().name).join(", "))
}