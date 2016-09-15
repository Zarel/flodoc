/* @flow */

var a = {};
/**
 * @param {string} x
 * @param {number} y
 * @return {boolean}
 */
a.foo = function foo(x, y) {
    return x.length * y === 5;
};

/**
 * @param {string} x
 * @param {number} y
 * @return {boolean}
 */
a.bar = function(x, y) {
    return x.length * y === 5;
};

/**
 * @param {string} a
 * @param {number} b
 * @return {boolean}
 */
var baz = function(a, b) {
    return a.length * b === 5;
};
