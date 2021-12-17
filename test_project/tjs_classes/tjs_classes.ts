export interface TJS_THIS{}

interface Order {
	id: number;
	name: string;
	completed?: boolean
}

export class TestClass implements TJS_THIS {
	name: string = ""

	startOrder(order: Order): void {
		void order;
	}
	
	completeOrder(order: Order): number | null {
		void order;
		return null;
	}
}