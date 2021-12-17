// marker interface, more on that in other file
export type PSEUDOMETHOD<T> = T

// this function will actually be executed when [1,2,3].exists(x => x === 5) is called
export function exists<T>(this: Array<T>, checker: (value: T) => boolean): boolean {
	for(let i = 0; i < this.length; i++){
		if(checker(this[i])){
			return true
		}
	}
	return false
}

// just for example: better organizing of referenced fuctions
// should be detected as well
export namespace ArrayMathFunctions {
	// this is also an example for more narrow generic typing
	// .sum won't be callable on array with something that is not number
	export function sum(this: Array<number>): number {
		let result = 0
		for(let i = 0; i < this.length; i++){
			result += this[i]
		}
		return result
	}
}