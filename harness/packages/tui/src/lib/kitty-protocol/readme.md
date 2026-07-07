# Overview

This folder contains a `node.js` implementation of [kitty input protocol](https://sw.kovidgoyal.net/kitty/keyboard-protocol/).

The implementation here is taken from [kitty-keys](https://github.com/eu-ge-ne/kitty-keys) project.
The reason to integrate it is to have more control over the implementation, and the fact that the original project
is not deployed to NPM and requires a new entry in a `.npmrc` config which is an overkill for a small piece of functionality.
