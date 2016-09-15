/* @flow */

/**
 * @param {string} x
 * @param {number} y
 */
function foo(x: string, y: number) {
    return x.length * y === 5;
}
foo('Hello', 42);
