//@ts-nocheck
// Named import
import { testing } from './tests';

// Aliased import
import { testing as test } from './tests2';

// Default import
import hello from 'hello_world1';

// Namespace import
import * as something from 'hello_world2';

// Side-effect import
import '@fastify/static';

// Require patterns
const mod = require('some-module');
require('polyfill');

// Destructured require
const { test122, test2 } = require('./destructured1');
// Aliased require
const { test122: test123, test2: test23, test3: test33 } = require('./destructured2');

// Mixed imports
import defaultExport, { namedExport } from './mixed';
import defaultExport2, * as namespace from './mixed2';


// Multiple import lines from the same file
import { one, two as alias, three } from './multiple';
import { never, gonna, give, you, up } from './multiple';

// Empty imports
import {} from './empty';

// String literal variations
import { test1 } from "./double-quoted";
import { test2 } from './single-quoted';

// Multiline imports
import {
    longImport1,
    longImport2 as alias2,
    longImport3
} from './multiline';

// Dynamic imports
const dynamicModule = import('./dynamic1');
const {testing, testing123} = import('./dynamic2');
const asyncDynamicModule = await import('./async_dynamic1').then(module => module.default);
// Aliased dynamic import
const { originalIdentifier: aliasedDynamicImport} = await import('./async_dynamic2');

// Comments in imports
import /* test */ { 
    // Comment in import
    commentedImport 
} from './commented'; // End of line comment 


