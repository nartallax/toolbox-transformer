import {GeneratedPage} from "classes_enumeration/page"

export namespace Pages {
	export namespace Generated {

		namespace NonMagic {
			export class PageC2 extends GeneratedPage {
				constructor() {
					super("page_c2")
				}
			}
		}

		export namespace Magic {
			export class PageC extends GeneratedPage {
				constructor() {
					super("page_c")
				}
			}

			export var pageC2 = NonMagic.PageC2
		}
	}
}