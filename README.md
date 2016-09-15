# flodoc

> A portmanteau of **flo**w and js**doc** based on flotate, allows using the [Flow](http://flowtype.org/) type checker with JSDoc syntax.


## Introduction

[Flow](http://flowtype.org/) implements many useful type checks, but also requires you to opt into a custom JavaScript syntax. Flow comments exists, but it's not particularly readable, and JSDoc already exists and is perfectly readable and supported by Visual Studio Code. So instead of writing:

```typescript
/* @flow */
function foo(x: string, y: number): boolean {
    return x.length * y === 5;
}
foo('Hello', 42);
```

...you can just write JSDoc-compatible code:

```javascript
/* @flow */
/**
 * @param {string} x
 * @param {number} y
 * @return {boolean}
 */
function foo(x, y) {
    return x.length * y === 5;
}
foo('Hello', 42);
```

It's win-some-lose-some: you lose by having to type a bit more, but win by keeping your code excellently documented/readable. You can always annotate a bit at a time and see how it works out, and see how it works out. With `flodoc`, you can do that evaluation without big commitments (say, to a non-standard JavaScript syntax).

The CLI tool aims to be a drop-in-compatible subset of exactly one of the `flow` commands: `flow check` becomes `flodoc check`.

## Installation

First get [Flow](http://flowtype.org/docs/getting-started.html), then install through `npm`:

```
$ npm install -g http://github.com/Zarel/flodoc
```

## Annotations

`flodoc` will convert the following JSDoc patterns into the corresponding Flow code:

 * `@param {TYPE} NAME` for function parameters
 * `@return {TYPE}`, `@returns {TYPE}` for function return values
 * `@type {TYPE}`, `@const {TYPE}`, `@constant {TYPE}` for variable types
 * In a constructor: `@type {TYPE}`, `@private {TYPE}`, `@protected {TYPE}`, `@public {TYPE}` above `this.NAME` for members on a class
 * `@typedef {TYPE} NAME` for defining types

`TYPE` should be a Flow-compatible type and `NAME` should be an identifier.

Explicitly unsupported JSDoc patterns include: ES5-style classes (i.e. `@class`, `@member`), non-Flow-compatible ways of defining functions/objects (i.e. `@callback` or `@property`).

If you need anything else, just use Flow Comments.

`flodoc` also supports Flow Comments notation:

 * `/*: whatever */` which translates to `: whatever`. This is by far the most common annotation you'll need, as it's the syntax Flow uses for [function arguments, return values](http://flowtype.org/docs/type-annotations.html#_) and [variables](http://flowtype.org/docs/variables.html#_). When `/*:` appears *immediately preceding* a function, however, it is treated as the complete signature of that function. See [here](test/fixtures/fancy-annotation.js) for an example.
 * `/*:: something */` which translates to `something`. This makes it possible to include anything you want Flow to see, but isn't standard JavaScript, such as [field types](http://flowtype.org/docs/classes.html#_), [reusable object types](http://flowtype.org/docs/objects.html#_) and [aliases](http://flowtype.org/docs/type-aliases.html#_).
 * `/*flow-include something */`, which is a more verbose but more self-documenting alias for `/*::` above.
 * `/*flow-ignore-begin*/` and `/*flow-ignore-end*/`, which translate to `/*` and `*/`, respectively. Flow is usually pretty smart about type inference etc, but sometimes it's just too much work to get a specific part of your code to type check. You'll most often run into this when doing dynamic property access etc, which may be very idiomatic JavaScript, but where Flow won't (and sometimes can't) predict the resulting types through static analysis alone. These annotations allow you to effectively hide that code from Flow, and take the "I know what I'm doing" escape hatch. Note that many times you can still annotate the surrounding function so that it'll appear fully typed from the outside.

## Examples

The following demonstrates how to use each annotation type, combined with an [ES6 class](https://github.com/esnext/es6-class) definition.

```javascript
/* @flow */

/**
 * @typedef {{timestamp: number, payload: string}} Message
 * @typedef {Array<Message>} Messages;
 */

class MessageStore {

  constructor() {
    /** @private {Messages} */
    this._msgs = [];
  }

  /**
   * @param {Message | Messages} newMessages
   */
  addMessages(newMessages) {
    this._msgs = this._msgs.concat(newMessages);
  }

}

var ms = new MessageStore();

/*flow-ignore-begin*/
ms.addMessages = function() {
  console.log('addMessages() called with', arguments);
  MessageStore.prototype.addMessages.apply(ms, arguments);
};
/*flow-ignore-end*/

ms.addMessages({
  payload: "Hello world!"
});
```

Some things worth pointing out:

 * We mark the module as eligible for type-checking with `/* @flow */`.
 * We define an object type `Message` and a type alias `Messages` using `@typedef`.
 * We define a field type `_msgs` using `@private`. The contents can also be single-line, if that looks better.
 * We define a (union) argument type for `newMessages` using `@param`, so the method accepts single objects as well as arrays of the same objects.
 * We dynamically patch `addMessages()` with some debugging info. Flow Comments (flotate) syntax is supported.

Attempting to type-check this will give us errors:

```
$ flodoc check .

/path/to/demo.js:4:17,7:2: property timestamp
Property not found in
  /path/to/demo.js:34:16,36:1: object literal

/path/to/demo.js:34:16,36:1: object literal
This type is incompatible with
  /path/to/demo.js:8:18,31: array type

/path/to/demo.js:34:16,36:1: object literal
This type is incompatible with
  /private/var/folders/k0/vy40jfp93d538th2y4hkzt7c0000gp/T/flow_jara/flowlib_b553107/lib/core.js:120:28,35: array type

Found 3 errors
```

We can fix the issue by adding the missing mandatory property `timestamp`:

```javascript
ms.addMessages({
  timestamp: Date.now(),
  payload: "Hello world!"
});
```

Now our module type-checks:

```
$ flodoc check .

Found 0 errors
```

For completeness, the following is what the above code is translated to, before being handed off to Flow for analysis:

```typescript
/* @flow */


  type Message = {
    timestamp: number;
    payload: string;
  };
  type Messages = Array<Message>;


class MessageStore {

  _msgs: Messages;

  constructor() {
    this._msgs = [];
  }

  addMessages(newMessages : Message | Messages ) {
    this._msgs = this._msgs.concat(newMessages);
  }

}

var ms = new MessageStore();

/*
ms.addMessages = function() {
  console.log('addMessages() called with', arguments);
  MessageStore.prototype.addMessages.apply(ms, arguments);
};
*/

ms.addMessages({
  timestamp: Date.now(),
  payload: "Hello world!"
});
```

## Dockerfile

You can also run `flodoc` without installing anything locally, given you already have [Docker](https://www.docker.com/).

Probably? That's how flotate works. I've never used Docker so I don't actually know if this fork changed anything that would affect compatibility.

### Building

```
$ docker build -t flodoc
```

### Running

```
$ docker run --rm -it -v $(pwd):/src:ro flodoc check .
```

## How it works

This tool is fundamentally just a simple pre-processor for Flow, a fork of `flotate`. When type-checking code, the following happens:

 1. Check for the presence of the `.flowconfig` file. It marks Flow "workspaces".
 1. Create a temporary path, that's automatically cleaned up on exit (with [temp](https://github.com/bruce/node-temp)).
 1. Recursively copy all files in the workspace to the temporary path (with [wrench](https://github.com/ryanmcgrath/wrench-js)).
 1. Update paths in the temporary copy of the `.flowconfig` file, so they point back to the original workspace. This is only needed for paths which reach outside the workspace (e.g. `../../node_modules`), and reduces the need to copy things around.
 1. Look for all files in the temporary workspace marked with `@flow`, and transform the comment annotations to their Flow counterparts (with [esprima](https://github.com/facebook/esprima) and [falafel](https://github.com/substack/node-falafel) and a lot of regexes).
 1. Invoke the relevant `flow` check on the temporary workspace.
 1. Output whatever `flow` outputs, and exit with whatever it exits with.
 1. Clean up.

## Acknowledgements

I've already mentioned so many times that this is a fork of `flotate`, but just to drive it in, this is a fork of https://github.com/jareware/flotate

Even the README is just flotate's readme, edited.

## License

This project is licensed under the terms of the MIT license.
