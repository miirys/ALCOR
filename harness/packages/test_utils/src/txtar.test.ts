// Copyright 2018 The Go Authors. All rights reserved.
// Use of this source code is governed by a BSD-style
// license that can be found in the LICENSE file.
//
// Adapted from: https://cs.opensource.google/go/x/tools/+/refs/tags/v0.37.0:txtar/archive_test.go

import { parse } from './txtar';

describe('txtar parser', () => {
  describe('parse', () => {
    const tests = [
      {
        name: 'basic',
        text: `comment1
comment2
-- file1 --
File 1 text.
-- foo ---
More file 1 text.
-- file 2 --
File 2 text.
-- empty --
-- noNL --
hello world
-- empty filename line --
some content
-- --`,
        parsed: [
          { name: 'file1', content: 'File 1 text.\n-- foo ---\nMore file 1 text.' },
          { name: 'file 2', content: 'File 2 text.' },
          { name: 'empty', content: '' },
          { name: 'noNL', content: 'hello world' },
          { name: 'empty filename line', content: 'some content' },
          { name: '', content: '' },
        ],
      },
    ];

    tests.forEach((tt) => {
      it(tt.name, () => {
        const result = parse(tt.text);
        expect(result).toEqual(tt.parsed);
      });
    });
  });
});
