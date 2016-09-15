/* @flow */
type FooBar = {id: number}; /** @typedef {{id: number}} FooBar */
/**
 * @param {FooBar} x
 * @return {boolean}
 */
function foo(x: FooBar): boolean {
    return x.id * 5 === 5;
}
/** @type {FooBar} */
var bar: FooBar = { id: 123 };
/** @type {number} */
var baz: number = 10;
foo(bar);
