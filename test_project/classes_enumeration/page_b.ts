import {ListPage} from "classes_enumeration/page";

class PageB extends ListPage<string> {
	constructor(){
		super(["a", "b", "c"], "page_b");
	}
}

console.log(new PageB().values);