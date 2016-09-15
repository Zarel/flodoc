/* @flow */
class Foo {
    /**
     * @param {string} key
     * @param {number} val
     */
    map: {[key:string]: number}; constructor(key: string, val: number) {
        /** @type {{[key:string]: number}} */
        this.map = {};
        this.map[key] = val;
    }

    /**
     * @param {string} key
     * @return {number}
     */
    method(key: string): number {
        return this.map[key];
    }
}
