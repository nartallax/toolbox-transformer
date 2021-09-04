import {ListPage} from "classes_enumeration/page";

export class PageA extends ListPage<number> {

	constructor(){
		super([1,2,3], "page_a");
	}

}