interface Order {
    id: number
    logs: {isLogs: true}
}

interface Good {
    isGood: true
}

interface THIS_IS_EXTERNAL_TYPE {}
interface ExternalOrder extends THIS_IS_EXTERNAL_TYPE {}
type ExternalOrderAsType = THIS_IS_EXTERNAL_TYPE

interface GoodOrder extends Order, Good, Driver<number> {
    isGoodOrder: true
}

interface MY_API_CLASS {}

interface Something<T> {value: T}
interface Something2<T = number> {value: T}

type Driver<T = number> = {id: T}
type Driver2<T> = {id: T}
type Driver3 = {
    [k: string]: number
}
type Driver4<T extends string, V extends string> = {
    [k in T | V]: number
};
type Copy<V> = {
    [k in keyof V]?: V[k] | "niet"
}

let x: Order = {id: 5} as Order

function ApiMethod(role: string): (target: unknown, propertyKey: string) => void {
	return (target: unknown) => {
		// target = прототип класса апи
		console.error(role, target)
	}
}

export class MyClass implements MY_API_CLASS {
    @ApiMethod("admin")
    action(_a: number, 
    _b: Order, 
    _bb: [number, number, ...string[]],
    _bbb: [number, number],
    _bbbb: [number, number, string?],
    _bbbbb: [number, number, string?, ...boolean[]],
    _bbbbbb: [number, number, ...Array<string>, number],
    _bbbbbbb: [count: number, length: number],
    _bbbbbbbb: [count?: number, length?: number, ...anythingElse: string[]],
    _bbbbbbbbb: [count?: number, length?: number, ...anythingElse: Array<string>],
    _c: string | null | false, 
    _cc: (number | string)[], 
    _ccc: Array<number | string>, 
    _cccc: Something<number>,
    _ccccc: Driver2<string>,
    _cccccc: Something2,
    _ccccccc: {a: number, b: string},
    _z: Driver3,
    _zz: Driver4<"a" | "b", "c" | "d">,
    _zzz: Copy<Order>,
    _zzzz: GoodOrder,
    _zzzzz: Copy<GoodOrder>,
    _zzzzzz: Copy<typeof x>,
    _zzzzzzz: Copy<typeof x.logs>,
    _e: ExternalOrder,
    _ee: ExternalOrderAsType,
    _d?: boolean | "nope", 
    _f?: Driver | true): void{
        
    }
}