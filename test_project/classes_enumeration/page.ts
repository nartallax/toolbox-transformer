export interface THIS_IS_PAGE_I_NEED_THIS {}

export abstract class Page implements THIS_IS_PAGE_I_NEED_THIS {
	constructor(readonly name: string) {}
}

export abstract class ListPage<T> extends Page {
	constructor(readonly values: T[], name: string) {
		super(name)
	}
}

export abstract class GeneratedPage extends Page {
}