/* @flow */

var a = {};
/**
 * @param {string} x
 * @param {number} y
 * @return {boolean}
 */
a.foo = function foo(x: string, y: number): boolean {
    return x.length * y === 5;
};

/**
 * @param {string} x
 * @param {number} y
 * @return {boolean}
 */
a.bar = function(x: string, y: number): boolean {
    return x.length * y === 5;
};

/**
 * @param {string} a
 * @param {number} b
 * @return {boolean}
 */
var baz = function(a: string, b: number): boolean {
    return a.length * b === 5;
};
