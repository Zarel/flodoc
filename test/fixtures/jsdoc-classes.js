/* @flow */
class Foo {
    /**
     * @param {string} key
     * @param {number} val
     */
    constructor(key, val) {
        /** @type {{[key:string]: number}} */
        this.map = {};
        this.map[key] = val;
    }

    /**
     * @param {string} key
     * @return {number}
     */
    method(key) {
        return this.map[key];
    }
}
