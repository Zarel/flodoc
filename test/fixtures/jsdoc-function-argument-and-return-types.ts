/* @flow */

/**
 * @param {string} x
 * @param {number} y
 * @return {boolean}
 */
function foo(x: string, y: number): boolean {
    return x.length * y === 5;
}
foo('Hello', 42);
