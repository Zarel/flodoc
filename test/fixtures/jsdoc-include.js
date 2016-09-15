/* @flow */
/** @typedef {{id: number}} FooBar */
/**
 * @param {FooBar} x
 * @return {boolean}
 */
function foo(x) {
    return x.id * 5 === 5;
}
/** @type {FooBar} */
var bar = { id: 123 };
/** @type {number} */
var baz = 10;
foo(bar);
