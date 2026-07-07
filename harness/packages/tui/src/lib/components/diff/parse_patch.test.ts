import { describe, it, expect } from '@jest/globals';
import { parsePatchToDiffLines, DiffLine } from './parse_patch';

describe('parsePatchToDiffLines', () => {
  describe('when patch is empty', () => {
    it('should return empty array', () => {
      const result = parsePatchToDiffLines('');

      expect(result).toEqual([]);
    });
  });

  describe('when patch contains only metadata headers', () => {
    it('should filter out diff --git lines', () => {
      const patch = 'diff --git a/file.txt b/file.txt';

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([]);
    });

    it('should filter out --- lines', () => {
      const patch = '--- a/file.txt';

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([]);
    });

    it('should filter out +++ lines', () => {
      const patch = '+++ b/file.txt';

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([]);
    });

    it('should filter out all metadata headers', () => {
      const patch = `diff --git a/file.txt b/file.txt
--- a/file.txt
+++ b/file.txt`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([]);
    });
  });

  describe('when patch contains hunk headers', () => {
    it('should parse simple hunk header', () => {
      const patch = '@@ -1,3 +1,4 @@';

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([{ type: 'header', content: '@@ -1,3 +1,4 @@' }]);
    });

    it('should parse hunk header without line counts', () => {
      const patch = '@@ -1 +1 @@';

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([{ type: 'header', content: '@@ -1 +1 @@' }]);
    });

    it('should parse hunk header with context after @@', () => {
      const patch = '@@ -10,5 +12,7 @@ function example() {';

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([
        { type: 'header', content: '@@ -10,5 +12,7 @@ function example() {' },
      ]);
    });
  });

  describe('when patch contains additions', () => {
    it('should parse single addition line', () => {
      const patch = `@@ -1,1 +1,2 @@
+new line`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toContainEqual({
        type: 'add',
        content: 'new line',
        newLineNum: 1,
      });
    });

    it('should increment newLineNum for consecutive additions', () => {
      const patch = `@@ -1,1 +1,3 @@
+first
+second
+third`;

      const result = parsePatchToDiffLines(patch);

      const additions = result.filter((line) => line.type === 'add');
      expect(additions).toEqual([
        { type: 'add', content: 'first', newLineNum: 1 },
        { type: 'add', content: 'second', newLineNum: 2 },
        { type: 'add', content: 'third', newLineNum: 3 },
      ]);
    });

    it('should handle addition of empty line', () => {
      const patch = `@@ -1,1 +1,2 @@
+`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toContainEqual({
        type: 'add',
        content: '',
        newLineNum: 1,
      });
    });
  });

  describe('when patch contains deletions', () => {
    it('should parse single deletion line', () => {
      const patch = `@@ -1,2 +1,1 @@
-removed line`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toContainEqual({
        type: 'del',
        content: 'removed line',
        oldLineNum: 1,
      });
    });

    it('should increment oldLineNum for consecutive deletions', () => {
      const patch = `@@ -1,3 +1,1 @@
-first
-second
-third`;

      const result = parsePatchToDiffLines(patch);

      const deletions = result.filter((line) => line.type === 'del');
      expect(deletions).toEqual([
        { type: 'del', content: 'first', oldLineNum: 1 },
        { type: 'del', content: 'second', oldLineNum: 2 },
        { type: 'del', content: 'third', oldLineNum: 3 },
      ]);
    });

    it('should handle deletion of empty line', () => {
      const patch = `@@ -1,2 +1,1 @@
-`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toContainEqual({
        type: 'del',
        content: '',
        oldLineNum: 1,
      });
    });
  });

  describe('when patch contains context lines', () => {
    it('should parse context line with both line numbers', () => {
      const patch = `@@ -1,2 +1,2 @@
 unchanged line`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toContainEqual({
        type: 'context',
        content: 'unchanged line',
        oldLineNum: 1,
        newLineNum: 1,
      });
    });

    it('should increment both line numbers for consecutive context lines', () => {
      const patch = `@@ -1,3 +1,3 @@
 first
 second
 third`;

      const result = parsePatchToDiffLines(patch);

      const contextLines = result.filter((line) => line.type === 'context');
      expect(contextLines).toEqual([
        { type: 'context', content: 'first', oldLineNum: 1, newLineNum: 1 },
        { type: 'context', content: 'second', oldLineNum: 2, newLineNum: 2 },
        { type: 'context', content: 'third', oldLineNum: 3, newLineNum: 3 },
      ]);
    });

    it('should handle context line that is empty (single space)', () => {
      const patch = `@@ -1,2 +1,2 @@
 `;

      const result = parsePatchToDiffLines(patch);

      expect(result).toContainEqual({
        type: 'context',
        content: '',
        oldLineNum: 1,
        newLineNum: 1,
      });
    });
  });

  describe('when patch contains mixed line types', () => {
    it('should correctly track line numbers across additions and deletions', () => {
      const patch = `@@ -1,3 +1,3 @@
 context
-old
+new
 more context`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([
        { type: 'header', content: '@@ -1,3 +1,3 @@' },
        { type: 'context', content: 'context', oldLineNum: 1, newLineNum: 1 },
        { type: 'del', content: 'old', oldLineNum: 2 },
        { type: 'add', content: 'new', newLineNum: 2 },
        { type: 'context', content: 'more context', oldLineNum: 3, newLineNum: 3 },
      ]);
    });

    it('should handle multiple deletions before additions', () => {
      const patch = `@@ -1,4 +1,3 @@
 context
-line1
-line2
+replacement
 end`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([
        { type: 'header', content: '@@ -1,4 +1,3 @@' },
        { type: 'context', content: 'context', oldLineNum: 1, newLineNum: 1 },
        { type: 'del', content: 'line1', oldLineNum: 2 },
        { type: 'del', content: 'line2', oldLineNum: 3 },
        { type: 'add', content: 'replacement', newLineNum: 2 },
        { type: 'context', content: 'end', oldLineNum: 4, newLineNum: 3 },
      ]);
    });

    it('should handle multiple additions after deletion', () => {
      const patch = `@@ -1,3 +1,4 @@
 context
-old
+new1
+new2
 end`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([
        { type: 'header', content: '@@ -1,3 +1,4 @@' },
        { type: 'context', content: 'context', oldLineNum: 1, newLineNum: 1 },
        { type: 'del', content: 'old', oldLineNum: 2 },
        { type: 'add', content: 'new1', newLineNum: 2 },
        { type: 'add', content: 'new2', newLineNum: 3 },
        { type: 'context', content: 'end', oldLineNum: 3, newLineNum: 4 },
      ]);
    });
  });

  describe('when patch contains multiple hunks', () => {
    it('should reset line numbers for each hunk', () => {
      const patch = `@@ -1,2 +1,2 @@
 first hunk context
-old1
+new1
@@ -10,2 +10,2 @@
 second hunk context
-old2
+new2`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([
        { type: 'header', content: '@@ -1,2 +1,2 @@' },
        { type: 'context', content: 'first hunk context', oldLineNum: 1, newLineNum: 1 },
        { type: 'del', content: 'old1', oldLineNum: 2 },
        { type: 'add', content: 'new1', newLineNum: 2 },
        { type: 'header', content: '@@ -10,2 +10,2 @@' },
        { type: 'context', content: 'second hunk context', oldLineNum: 10, newLineNum: 10 },
        { type: 'del', content: 'old2', oldLineNum: 11 },
        { type: 'add', content: 'new2', newLineNum: 11 },
      ]);
    });

    it('should handle hunks with different starting line numbers', () => {
      const patch = `@@ -5,1 +7,1 @@
-at line 5
+at line 7
@@ -100,1 +200,1 @@
-at line 100
+at line 200`;

      const result = parsePatchToDiffLines(patch);

      const deletions = result.filter((line) => line.type === 'del');
      const additions = result.filter((line) => line.type === 'add');

      expect(deletions[0].oldLineNum).toBe(5);
      expect(additions[0].newLineNum).toBe(7);
      expect(deletions[1].oldLineNum).toBe(100);
      expect(additions[1].newLineNum).toBe(200);
    });
  });

  describe('when patch contains unknown line types', () => {
    it('should skip lines that do not start with expected prefixes', () => {
      const patch = `@@ -1,1 +1,1 @@
this line has no prefix
 context`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([
        { type: 'header', content: '@@ -1,1 +1,1 @@' },
        { type: 'context', content: 'context', oldLineNum: 1, newLineNum: 1 },
      ]);
    });

    it('should skip completely empty lines', () => {
      const patch = `@@ -1,2 +1,2 @@
 context1

 context2`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([
        { type: 'header', content: '@@ -1,2 +1,2 @@' },
        { type: 'context', content: 'context1', oldLineNum: 1, newLineNum: 1 },
        { type: 'context', content: 'context2', oldLineNum: 2, newLineNum: 2 },
      ]);
    });
  });

  describe('when patch is a complete unified diff', () => {
    it('should parse realistic diff output', () => {
      const patch = `diff --git a/src/example.ts b/src/example.ts
--- a/src/example.ts
+++ b/src/example.ts
@@ -1,5 +1,6 @@
 import { foo } from 'bar';
 
-export function oldName() {
+export function newName() {
+  console.log('added line');
   return 42;
 }`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([
        { type: 'header', content: '@@ -1,5 +1,6 @@' },
        { type: 'context', content: "import { foo } from 'bar';", oldLineNum: 1, newLineNum: 1 },
        { type: 'context', content: '', oldLineNum: 2, newLineNum: 2 },
        { type: 'del', content: 'export function oldName() {', oldLineNum: 3 },
        { type: 'add', content: 'export function newName() {', newLineNum: 3 },
        { type: 'add', content: "  console.log('added line');", newLineNum: 4 },
        { type: 'context', content: '  return 42;', oldLineNum: 4, newLineNum: 5 },
        { type: 'context', content: '}', oldLineNum: 5, newLineNum: 6 },
      ]);
    });

    it('should handle new file creation diff', () => {
      const patch = `diff --git a/newfile.ts b/newfile.ts
--- /dev/null
+++ b/newfile.ts
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([
        { type: 'header', content: '@@ -0,0 +1,3 @@' },
        { type: 'add', content: 'line 1', newLineNum: 1 },
        { type: 'add', content: 'line 2', newLineNum: 2 },
        { type: 'add', content: 'line 3', newLineNum: 3 },
      ]);
    });

    it('should handle file deletion diff', () => {
      const patch = `diff --git a/oldfile.ts b/oldfile.ts
--- a/oldfile.ts
+++ /dev/null
@@ -1,3 +0,0 @@
-line 1
-line 2
-line 3`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([
        { type: 'header', content: '@@ -1,3 +0,0 @@' },
        { type: 'del', content: 'line 1', oldLineNum: 1 },
        { type: 'del', content: 'line 2', oldLineNum: 2 },
        { type: 'del', content: 'line 3', oldLineNum: 3 },
      ]);
    });
  });

  describe('when content contains special characters', () => {
    it('should preserve content with leading + in context lines', () => {
      const patch = `@@ -1,1 +1,1 @@
 +1 is a positive number`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toContainEqual({
        type: 'context',
        content: '+1 is a positive number',
        oldLineNum: 1,
        newLineNum: 1,
      });
    });

    it('should preserve content with leading - in context lines', () => {
      const patch = `@@ -1,1 +1,1 @@
 -1 is a negative number`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toContainEqual({
        type: 'context',
        content: '-1 is a negative number',
        oldLineNum: 1,
        newLineNum: 1,
      });
    });

    it('should handle content with @@ in it', () => {
      const patch = `@@ -1,1 +1,1 @@
+const email = 'test@@example.com';`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toContainEqual({
        type: 'add',
        content: "const email = 'test@@example.com';",
        newLineNum: 1,
      });
    });

    it('should preserve indentation in content', () => {
      const patch = `@@ -1,2 +1,2 @@
+    indented with spaces
+\tindented with tab`;

      const result = parsePatchToDiffLines(patch);

      const additions = result.filter((line) => line.type === 'add') as DiffLine[];
      expect(additions[0].content).toBe('    indented with spaces');
      expect(additions[1].content).toBe('\tindented with tab');
    });
  });

  describe('when patch uses CRLF line endings', () => {
    it('should not leave trailing carriage returns in content', () => {
      const patch = ['@@ -1,3 +1,3 @@', ' context', '-old line', '+new line'].join('\r\n');

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([
        { type: 'header', content: '@@ -1,3 +1,3 @@' },
        { type: 'context', content: 'context', oldLineNum: 1, newLineNum: 1 },
        { type: 'del', content: 'old line', oldLineNum: 2 },
        { type: 'add', content: 'new line', newLineNum: 2 },
      ]);
    });
  });

  describe('when hunk header has malformed format', () => {
    it('should still include header even if line numbers cannot be extracted', () => {
      const patch = '@@ invalid header @@';

      const result = parsePatchToDiffLines(patch);

      expect(result).toEqual([{ type: 'header', content: '@@ invalid header @@' }]);
    });

    it('should use default line numbers (0) when extraction fails', () => {
      const patch = `@@ invalid @@
+added line`;

      const result = parsePatchToDiffLines(patch);

      expect(result).toContainEqual({
        type: 'add',
        content: 'added line',
        newLineNum: 0,
      });
    });
  });
});
