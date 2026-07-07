import { Position } from 'vscode-languageserver-protocol';
import Parser from 'web-tree-sitter';
import { Intent, getIntent } from '../../../common/tree_sitter';
import { LanguageServerLanguageId, getFixturePath, getTreeAndTestFile } from './test_utils';

describe('IntentResolver', () => {
  beforeEach(async () => {
    await Parser.init();
  });

  describe('Small File Intent', () => {
    it('should resolve small file intent', async () => {
      const fixturePath = getFixturePath('intent', 'typescript_small_file.ts');
      const position = { line: 3, character: 0 };
      const treeAndTestFile = await getTreeAndTestFile({
        fixturePath,
        position,
        languageId: 'typescript',
      });
      if (!treeAndTestFile) {
        throw new Error('Failed to get tree and test file');
      }
      const intent = await getIntent({
        treeAndLanguage: treeAndTestFile.treeAndLanguage,
        position,
        prefix: treeAndTestFile.prefix,
        suffix: treeAndTestFile.suffix,
      });
      expect(intent.intent).toBe('generation');
      expect(intent.generationType).toBe('small_file');
    });

    it('should resolve comment completion intent when cursor is on a comment in a small file', async () => {
      const fixturePath = getFixturePath('intent', 'typescript_small_file.ts');
      const position = { line: 5, character: 15 };
      const treeAndTestFile = await getTreeAndTestFile({
        fixturePath,
        position,
        languageId: 'typescript',
      });
      if (!treeAndTestFile) {
        throw new Error('Failed to get tree and test file');
      }
      const intent = await getIntent({
        treeAndLanguage: treeAndTestFile.treeAndLanguage,
        position,
        prefix: treeAndTestFile.prefix,
        suffix: treeAndTestFile.suffix,
      });
      expect(intent.intent).toBe('completion');
    });
  });

  describe('Comment Intent', () => {
    type TestType =
      | 'on_empty_comment'
      | 'after_empty_comment'
      | 'on_non_empty_comment'
      | 'after_non_empty_comment'
      | 'in_block_comment'
      | 'on_block_comment'
      | 'after_block_comment'
      | 'in_jsdoc_comment'
      | 'on_jsdoc_comment'
      | 'after_jsdoc_comment'
      | 'in_doc_comment'
      | 'on_doc_comment'
      | 'after_doc_comment'
      | 'no_comment_large_file'
      | 'on_comment_in_empty_function'
      | 'after_comment_in_empty_function';

    type FileExtension = string;

    /**
     * Position refers to the position of the cursor in the test file.
     */
    type IntentTestCase = [TestType, Position, Intent];

    /**
     * Note: We use the language server protocol Ids here because `IDocContext` expects
     * these Ids (which is passed into `ParseFile`) and because they are unique.
     * `ParseFile` derives the tree sitter gramamr from the file's extension.
     * Some grammars apply to multiple extensions, eg. `typescript` applies
     * to both `.ts` and `.tsx`.
     */
    const testCases: Array<[LanguageServerLanguageId, FileExtension, IntentTestCase[]]> = [
      [
        'vue',
        '.vue', // ../../fixtures/intent/vue_comments.vue
        [
          ['on_empty_comment', { line: 2, character: 9 }, 'completion'],
          ['after_empty_comment', { line: 3, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 5, character: 3 }, 'completion'],
          ['after_non_empty_comment', { line: 6, character: 0 }, 'generation'],
          ['in_block_comment', { line: 9, character: 23 }, 'completion'],
          ['on_block_comment', { line: 10, character: 2 }, 'completion'],
          ['after_block_comment', { line: 11, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 14, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 29, character: 33 }, 'completion'],
          ['after_comment_in_empty_function', { line: 30, character: 0 }, 'generation'],
        ],
      ],
      [
        'typescript',
        '.ts', // ../../fixtures/intent/typescript_comments.ts
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 8, character: 23 }, 'completion'],
          ['on_block_comment', { line: 9, character: 2 }, 'completion'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['in_jsdoc_comment', { line: 14, character: 21 }, 'completion'],
          ['on_jsdoc_comment', { line: 15, character: 3 }, 'completion'],
          ['after_jsdoc_comment', { line: 16, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 24, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 30, character: 31 }, 'completion'],
          ['after_comment_in_empty_function', { line: 31, character: 0 }, 'generation'],
        ],
      ],
      [
        'typescriptreact',
        '.tsx', // ../../fixtures/intent/typescriptreact_comments.tsx
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 8, character: 23 }, 'completion'],
          ['on_block_comment', { line: 9, character: 2 }, 'completion'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['in_jsdoc_comment', { line: 14, character: 21 }, 'completion'],
          ['on_jsdoc_comment', { line: 15, character: 3 }, 'completion'],
          ['after_jsdoc_comment', { line: 16, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 24, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 30, character: 31 }, 'completion'],
          ['after_comment_in_empty_function', { line: 31, character: 0 }, 'generation'],
        ],
      ],
      [
        'javascript',
        '.js', // ../../fixtures/intent/javascript_comments.js
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 8, character: 23 }, 'completion'],
          ['on_block_comment', { line: 9, character: 2 }, 'completion'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['in_jsdoc_comment', { line: 14, character: 21 }, 'completion'],
          ['on_jsdoc_comment', { line: 15, character: 3 }, 'completion'],
          ['after_jsdoc_comment', { line: 16, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 24, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 30, character: 31 }, 'completion'],
          ['after_comment_in_empty_function', { line: 31, character: 0 }, 'generation'],
        ],
      ],
      [
        'javascriptreact',
        '.jsx', // ../../fixtures/intent/javascriptreact_comments.jsx
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 8, character: 23 }, 'completion'],
          ['on_block_comment', { line: 9, character: 2 }, 'completion'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['in_jsdoc_comment', { line: 15, character: 25 }, 'completion'],
          ['on_jsdoc_comment', { line: 16, character: 3 }, 'completion'],
          ['after_jsdoc_comment', { line: 17, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 24, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 31, character: 31 }, 'completion'],
          ['after_comment_in_empty_function', { line: 32, character: 0 }, 'generation'],
        ],
      ],
      [
        'ruby',
        '.rb', // ../../fixtures/intent/ruby_comments.rb
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 9, character: 23 }, 'completion'],
          ['on_block_comment', { line: 10, character: 4 }, 'completion'],
          ['after_block_comment', { line: 11, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 17, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 21, character: 30 }, 'completion'],
          ['after_comment_in_empty_function', { line: 22, character: 22 }, 'generation'],
        ],
      ],
      [
        'go',
        '.go', // ../../fixtures/intent/go_comments.go
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 8, character: 23 }, 'completion'],
          ['on_block_comment', { line: 9, character: 2 }, 'completion'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 20, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 24, character: 31 }, 'completion'],
          ['after_comment_in_empty_function', { line: 25, character: 0 }, 'generation'],
        ],
      ],
      [
        'java',
        '.java', // ../../fixtures/intent/java_comments.java
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 8, character: 23 }, 'completion'],
          ['on_block_comment', { line: 9, character: 2 }, 'completion'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['in_doc_comment', { line: 14, character: 29 }, 'completion'],
          ['on_doc_comment', { line: 15, character: 3 }, 'completion'],
          ['after_doc_comment', { line: 16, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 23, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 30, character: 31 }, 'completion'],
          ['after_comment_in_empty_function', { line: 31, character: 0 }, 'generation'],
        ],
      ],
      [
        'kotlin',
        '.kt', // ../../fixtures/intent/kotlin_comments.kt
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 8, character: 23 }, 'completion'],
          ['on_block_comment', { line: 9, character: 2 }, 'completion'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['in_doc_comment', { line: 14, character: 29 }, 'completion'],
          ['on_doc_comment', { line: 15, character: 3 }, 'completion'],
          ['after_doc_comment', { line: 16, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 23, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 30, character: 31 }, 'completion'],
          ['after_comment_in_empty_function', { line: 31, character: 0 }, 'generation'],
        ],
      ],
      [
        'rust',
        '.rs', // ../../fixtures/intent/rust_comments.rs
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 8, character: 23 }, 'completion'],
          ['on_block_comment', { line: 9, character: 2 }, 'completion'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['in_doc_comment', { line: 11, character: 25 }, 'completion'],
          ['on_doc_comment', { line: 12, character: 42 }, 'completion'],
          ['after_doc_comment', { line: 15, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 23, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 26, character: 31 }, 'completion'],
          ['after_comment_in_empty_function', { line: 27, character: 0 }, 'generation'],
        ],
      ],
      [
        'yaml',
        '.yaml', // ../../fixtures/intent/yaml_comments.yaml
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 17, character: 0 }, undefined],
        ],
      ],
      [
        'html',
        '.html', // ../../fixtures/intent/html_comments.html
        [
          ['on_empty_comment', { line: 14, character: 12 }, 'completion'],
          ['after_empty_comment', { line: 15, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 8, character: 91 }, 'completion'],
          ['after_non_empty_comment', { line: 9, character: 0 }, 'generation'],
          ['in_block_comment', { line: 18, character: 29 }, 'completion'],
          ['on_block_comment', { line: 19, character: 7 }, 'completion'],
          ['after_block_comment', { line: 20, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 12, character: 66 }, undefined],
        ],
      ],
      [
        'c',
        '.c', // ../../fixtures/intent/c_comments.c
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 8, character: 23 }, 'completion'],
          ['on_block_comment', { line: 9, character: 2 }, 'completion'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 17, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 20, character: 31 }, 'completion'],
          ['after_comment_in_empty_function', { line: 21, character: 0 }, 'generation'],
        ],
      ],
      [
        'cpp',
        '.cpp', // ../../fixtures/intent/cpp_comments.cpp
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 8, character: 23 }, 'completion'],
          ['on_block_comment', { line: 9, character: 2 }, 'completion'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 17, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 20, character: 31 }, 'completion'],
          ['after_comment_in_empty_function', { line: 21, character: 0 }, 'generation'],
        ],
      ],
      [
        'csharp',
        '.cs', // ../../fixtures/intent/csharp_comments.cs
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 4, character: 30 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['in_block_comment', { line: 8, character: 23 }, 'completion'],
          ['on_block_comment', { line: 9, character: 2 }, 'completion'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 17, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 20, character: 31 }, 'completion'],
          ['after_comment_in_empty_function', { line: 21, character: 22 }, 'generation'],
        ],
      ],

      [
        'css',
        '.css', // ../../fixtures/intent/css_comments.css
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 3, character: 31 }, 'completion'],
          ['after_non_empty_comment', { line: 4, character: 0 }, 'generation'],
          ['in_block_comment', { line: 7, character: 23 }, 'completion'],
          ['on_block_comment', { line: 8, character: 2 }, 'completion'],
          ['after_block_comment', { line: 9, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 17, character: 0 }, undefined],
        ],
      ],
      [
        'shellscript',
        '.sh', // ../../fixtures/intent/shellscript_comments.css
        [
          ['on_empty_comment', { line: 4, character: 1 }, 'completion'],
          ['after_empty_comment', { line: 5, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 2, character: 65 }, 'completion'],
          ['after_non_empty_comment', { line: 3, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 10, character: 0 }, undefined],
          ['on_comment_in_empty_function', { line: 19, character: 12 }, 'completion'],
          ['after_comment_in_empty_function', { line: 20, character: 0 }, 'generation'],
        ],
      ],
      [
        'json',
        '.json', // ../../fixtures/intent/json_comments.css
        [
          ['on_empty_comment', { line: 20, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 21, character: 0 }, 'completion'],
          ['on_non_empty_comment', { line: 0, character: 38 }, 'completion'],
          ['after_non_empty_comment', { line: 1, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 10, character: 0 }, undefined],
        ],
      ],
      [
        'scala',
        '.scala', // ../../fixtures/intent/scala_comments.scala
        [
          ['on_empty_comment', { line: 1, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 2, character: 3 }, 'completion'],
          ['after_non_empty_comment', { line: 5, character: 0 }, 'generation'],
          ['after_block_comment', { line: 10, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 12, character: 0 }, undefined],
          ['after_comment_in_empty_function', { line: 21, character: 0 }, 'generation'],
        ],
      ],
      [
        'powershell',
        '.ps1', // ../../fixtures/intent/powershell_comments.ps1
        [
          ['on_empty_comment', { line: 20, character: 3 }, 'completion'],
          ['after_empty_comment', { line: 21, character: 3 }, 'completion'],
          ['after_non_empty_comment', { line: 10, character: 0 }, 'generation'],
          ['after_block_comment', { line: 8, character: 0 }, 'generation'],
          ['no_comment_large_file', { line: 22, character: 0 }, undefined],
          ['after_comment_in_empty_function', { line: 26, character: 0 }, 'generation'],
        ],
      ],
    ];

    describe.each(testCases)('%s', (language, fileExt, cases) => {
      it.each(cases)('should resolve %s intent correctly', async (_, position, expectedIntent) => {
        const fixturePath = getFixturePath('intent', `${language}_comments${fileExt}`);
        const treeAndTestFile = await getTreeAndTestFile({
          fixturePath,
          position,
          languageId: language,
        });
        if (!treeAndTestFile) {
          throw new Error('Failed to get tree and test file');
        }
        const { treeAndLanguage, prefix, suffix } = treeAndTestFile;
        const intent = await getIntent({ treeAndLanguage, position, prefix, suffix });
        expect(intent.intent).toBe(expectedIntent);
        if (expectedIntent === 'generation') {
          expect(intent.generationType).toBe('comment');
        }
      });
    });
  });

  describe('Empty Function Intent', () => {
    type TestType =
      | 'empty_function_declaration'
      | 'non_empty_function_declaration'
      | 'empty_function_expression'
      | 'non_empty_function_expression'
      | 'empty_arrow_function'
      | 'non_empty_arrow_function'
      | 'empty_method_definition'
      | 'non_empty_method_definition'
      | 'empty_class_constructor'
      | 'non_empty_class_constructor'
      | 'empty_class_declaration'
      | 'non_empty_class_declaration'
      | 'empty_anonymous_function'
      | 'non_empty_anonymous_function'
      | 'empty_implementation'
      | 'non_empty_implementation'
      | 'empty_closure_expression'
      | 'non_empty_closure_expression'
      | 'empty_generator'
      | 'non_empty_generator'
      | 'empty_macro'
      | 'non_empty_macro';

    type FileExtension = string;

    /**
     * Position refers to the position of the cursor in the test file.
     */
    type IntentTestCase = [TestType, Position, Intent];

    const emptyFunctionTestCases: Array<
      [LanguageServerLanguageId, FileExtension, IntentTestCase[]]
    > = [
      [
        'vue',
        '.vue', // ../../fixtures/intent/empty_function/vue.ts
        [
          ['empty_function_declaration', { line: 46, character: 6 }, 'generation'],
          ['non_empty_function_declaration', { line: 4, character: 4 }, undefined],
          ['empty_function_expression', { line: 7, character: 32 }, 'generation'],
          ['non_empty_function_expression', { line: 11, character: 4 }, undefined],
          ['empty_arrow_function', { line: 13, character: 26 }, 'generation'],
          ['non_empty_arrow_function', { line: 16, character: 4 }, undefined],
          ['empty_class_constructor', { line: 20, character: 21 }, 'generation'],
          ['empty_method_definition', { line: 22, character: 11 }, 'generation'],
          ['non_empty_class_constructor', { line: 28, character: 7 }, undefined],
          ['non_empty_method_definition', { line: 32, character: 0 }, undefined],
          ['empty_class_declaration', { line: 35, character: 14 }, 'generation'],
          ['empty_generator', { line: 37, character: 31 }, 'generation'],
          ['non_empty_generator', { line: 40, character: 4 }, undefined],
        ],
      ],
      [
        'typescript',
        '.ts', // ../../fixtures/intent/empty_function/typescript.ts
        [
          ['empty_function_declaration', { line: 0, character: 22 }, 'generation'],
          ['non_empty_function_declaration', { line: 3, character: 4 }, undefined],
          ['empty_function_expression', { line: 6, character: 32 }, 'generation'],
          ['non_empty_function_expression', { line: 10, character: 4 }, undefined],
          ['empty_arrow_function', { line: 12, character: 26 }, 'generation'],
          ['non_empty_arrow_function', { line: 15, character: 4 }, undefined],
          ['empty_class_constructor', { line: 19, character: 21 }, 'generation'],
          ['empty_method_definition', { line: 21, character: 11 }, 'generation'],
          ['non_empty_class_constructor', { line: 29, character: 7 }, undefined],
          ['non_empty_method_definition', { line: 33, character: 0 }, undefined],
          ['empty_class_declaration', { line: 36, character: 14 }, 'generation'],
          ['empty_generator', { line: 38, character: 31 }, 'generation'],
          ['non_empty_generator', { line: 41, character: 4 }, undefined],
        ],
      ],
      [
        'javascript',
        '.js', // ../../fixtures/intent/empty_function/javascript.js
        [
          ['empty_function_declaration', { line: 0, character: 22 }, 'generation'],
          ['non_empty_function_declaration', { line: 3, character: 4 }, undefined],
          ['empty_function_expression', { line: 6, character: 32 }, 'generation'],
          ['non_empty_function_expression', { line: 10, character: 4 }, undefined],
          ['empty_arrow_function', { line: 12, character: 26 }, 'generation'],
          ['non_empty_arrow_function', { line: 15, character: 4 }, undefined],
          ['empty_class_constructor', { line: 19, character: 21 }, 'generation'],
          ['empty_method_definition', { line: 21, character: 11 }, 'generation'],
          ['non_empty_class_constructor', { line: 27, character: 7 }, undefined],
          ['non_empty_method_definition', { line: 31, character: 0 }, undefined],
          ['empty_class_declaration', { line: 34, character: 14 }, 'generation'],
          ['empty_generator', { line: 36, character: 31 }, 'generation'],
          ['non_empty_generator', { line: 39, character: 4 }, undefined],
        ],
      ],
      [
        'go',
        '.go', // ../../fixtures/intent/empty_function/go.go
        [
          ['empty_function_declaration', { line: 0, character: 25 }, 'generation'],
          ['non_empty_function_declaration', { line: 3, character: 4 }, undefined],
          ['empty_anonymous_function', { line: 6, character: 32 }, 'generation'],
          ['non_empty_anonymous_function', { line: 10, character: 0 }, undefined],
          ['empty_method_definition', { line: 19, character: 25 }, 'generation'],
          ['non_empty_method_definition', { line: 23, character: 0 }, undefined],
        ],
      ],
      [
        'java',
        '.java', // ../../fixtures/intent/empty_function/java.java
        [
          ['empty_function_declaration', { line: 0, character: 26 }, 'generation'],
          ['non_empty_function_declaration', { line: 3, character: 4 }, undefined],
          ['empty_anonymous_function', { line: 7, character: 0 }, 'generation'],
          ['non_empty_anonymous_function', { line: 10, character: 0 }, undefined],
          ['empty_class_declaration', { line: 15, character: 18 }, 'generation'],
          ['non_empty_class_declaration', { line: 19, character: 0 }, undefined],
          ['empty_class_constructor', { line: 18, character: 13 }, 'generation'],
          ['empty_method_definition', { line: 20, character: 18 }, 'generation'],
          ['non_empty_class_constructor', { line: 26, character: 18 }, undefined],
          ['non_empty_method_definition', { line: 30, character: 18 }, undefined],
        ],
      ],
      [
        'rust',
        '.rs', // ../../fixtures/intent/empty_function/rust.vue
        [
          ['empty_function_declaration', { line: 0, character: 23 }, 'generation'],
          ['non_empty_function_declaration', { line: 3, character: 4 }, undefined],
          ['empty_implementation', { line: 8, character: 13 }, 'generation'],
          ['non_empty_implementation', { line: 11, character: 0 }, undefined],
          ['empty_class_constructor', { line: 13, character: 0 }, 'generation'],
          ['non_empty_class_constructor', { line: 23, character: 0 }, undefined],
          ['empty_method_definition', { line: 17, character: 0 }, 'generation'],
          ['non_empty_method_definition', { line: 26, character: 0 }, undefined],
          ['empty_closure_expression', { line: 32, character: 0 }, 'generation'],
          ['non_empty_closure_expression', { line: 36, character: 0 }, undefined],
          ['empty_macro', { line: 42, character: 11 }, 'generation'],
          ['non_empty_macro', { line: 45, character: 11 }, undefined],
          ['empty_macro', { line: 55, character: 0 }, 'generation'],
          ['non_empty_macro', { line: 62, character: 20 }, undefined],
        ],
      ],
      [
        'kotlin',
        '.kt', // ../../fixtures/intent/empty_function/kotlin.kt
        [
          ['empty_function_declaration', { line: 0, character: 25 }, 'generation'],
          ['non_empty_function_declaration', { line: 4, character: 0 }, undefined],
          ['empty_anonymous_function', { line: 6, character: 32 }, 'generation'],
          ['non_empty_anonymous_function', { line: 9, character: 4 }, undefined],
          ['empty_class_declaration', { line: 12, character: 14 }, 'generation'],
          ['non_empty_class_declaration', { line: 15, character: 14 }, undefined],
          ['empty_method_definition', { line: 24, character: 0 }, 'generation'],
          ['non_empty_method_definition', { line: 28, character: 0 }, undefined],
        ],
      ],
      [
        'typescriptreact',
        '.tsx', // ../../fixtures/intent/empty_function/typescriptreact.tsx
        [
          ['empty_function_declaration', { line: 0, character: 22 }, 'generation'],
          ['non_empty_function_declaration', { line: 3, character: 4 }, undefined],
          ['empty_function_expression', { line: 6, character: 32 }, 'generation'],
          ['non_empty_function_expression', { line: 10, character: 4 }, undefined],
          ['empty_arrow_function', { line: 12, character: 26 }, 'generation'],
          ['non_empty_arrow_function', { line: 15, character: 4 }, undefined],
          ['empty_class_constructor', { line: 19, character: 21 }, 'generation'],
          ['empty_method_definition', { line: 21, character: 11 }, 'generation'],
          ['non_empty_class_constructor', { line: 29, character: 7 }, undefined],
          ['non_empty_method_definition', { line: 33, character: 0 }, undefined],
          ['empty_class_declaration', { line: 36, character: 14 }, 'generation'],
          ['non_empty_arrow_function', { line: 40, character: 0 }, undefined],
          ['empty_arrow_function', { line: 41, character: 23 }, 'generation'],
          ['non_empty_arrow_function', { line: 44, character: 23 }, undefined],
          ['empty_generator', { line: 54, character: 31 }, 'generation'],
          ['non_empty_generator', { line: 57, character: 4 }, undefined],
        ],
      ],
      [
        'c',
        '.c', // ../../fixtures/intent/empty_function/c.c
        [
          ['empty_function_declaration', { line: 0, character: 24 }, 'generation'],
          ['non_empty_function_declaration', { line: 3, character: 0 }, undefined],
        ],
      ],
      [
        'cpp',
        '.cpp', // ../../fixtures/intent/empty_function/cpp.cpp
        [
          ['empty_function_declaration', { line: 0, character: 37 }, 'generation'],
          ['non_empty_function_declaration', { line: 3, character: 0 }, undefined],
          ['empty_function_expression', { line: 6, character: 43 }, 'generation'],
          ['non_empty_function_expression', { line: 10, character: 4 }, undefined],
          ['empty_class_constructor', { line: 15, character: 37 }, 'generation'],
          ['empty_method_definition', { line: 17, character: 18 }, 'generation'],
          ['non_empty_class_constructor', { line: 27, character: 7 }, undefined],
          ['non_empty_method_definition', { line: 31, character: 0 }, undefined],
          ['empty_class_declaration', { line: 35, character: 14 }, 'generation'],
        ],
      ],
      [
        'csharp',
        '.cs', // ../../fixtures/intent/empty_function/csharp.cs
        [
          ['empty_function_expression', { line: 2, character: 48 }, 'generation'],
          ['empty_class_constructor', { line: 4, character: 31 }, 'generation'],
          ['empty_method_definition', { line: 6, character: 31 }, 'generation'],
          ['non_empty_class_constructor', { line: 15, character: 0 }, undefined],
          ['non_empty_method_definition', { line: 20, character: 0 }, undefined],
          ['empty_class_declaration', { line: 24, character: 22 }, 'generation'],
        ],
      ],
      [
        'shellscript',
        '.sh', // ../../fixtures/intent/empty_function/shellscript.sh
        [
          ['empty_function_declaration', { line: 3, character: 48 }, 'generation'],
          ['non_empty_function_declaration', { line: 6, character: 31 }, undefined],
        ],
      ],
      [
        'scala',
        '.scala', // ../../fixtures/intent/empty_function/scala.scala
        [
          ['empty_function_declaration', { line: 1, character: 4 }, 'generation'],
          ['non_empty_function_declaration', { line: 5, character: 4 }, undefined],
          ['empty_method_definition', { line: 28, character: 3 }, 'generation'],
          ['non_empty_method_definition', { line: 34, character: 3 }, undefined],
          ['empty_class_declaration', { line: 22, character: 4 }, 'generation'],
          ['non_empty_class_declaration', { line: 27, character: 0 }, undefined],
          ['empty_anonymous_function', { line: 13, character: 0 }, 'generation'],
          ['non_empty_anonymous_function', { line: 17, character: 0 }, undefined],
        ],
      ],
      [
        'ruby',
        '.rb', // ../../fixtures/intent/empty_function/ruby.rb
        [
          ['empty_method_definition', { line: 0, character: 23 }, 'generation'],
          ['empty_method_definition', { line: 0, character: 6 }, undefined],
          ['non_empty_method_definition', { line: 3, character: 0 }, undefined],
          ['empty_anonymous_function', { line: 7, character: 27 }, 'generation'],
          ['non_empty_anonymous_function', { line: 9, character: 37 }, undefined],
          ['empty_anonymous_function', { line: 11, character: 25 }, 'generation'],
          ['empty_class_constructor', { line: 16, character: 22 }, 'generation'],
          ['non_empty_class_declaration', { line: 18, character: 0 }, undefined],
          ['empty_method_definition', { line: 20, character: 1 }, 'generation'],
          ['empty_class_declaration', { line: 33, character: 12 }, 'generation'],
        ],
      ],
      [
        'python',
        '.py', // ../../fixtures/intent/empty_function/python.py
        [
          ['empty_function_declaration', { line: 1, character: 4 }, 'generation'],
          ['non_empty_function_declaration', { line: 5, character: 4 }, undefined],
          ['empty_class_constructor', { line: 10, character: 0 }, 'generation'],
          ['empty_method_definition', { line: 14, character: 0 }, 'generation'],
          ['non_empty_class_constructor', { line: 19, character: 0 }, undefined],
          ['non_empty_method_definition', { line: 23, character: 4 }, undefined],
          ['empty_class_declaration', { line: 27, character: 4 }, 'generation'],
          ['empty_function_declaration', { line: 31, character: 4 }, 'generation'],
          ['empty_class_constructor', { line: 36, character: 4 }, 'generation'],
          ['empty_method_definition', { line: 40, character: 4 }, 'generation'],
          ['empty_class_declaration', { line: 44, character: 4 }, 'generation'],
          ['empty_function_declaration', { line: 49, character: 4 }, 'generation'],
          ['empty_class_constructor', { line: 53, character: 4 }, 'generation'],
          ['empty_method_definition', { line: 56, character: 4 }, 'generation'],
          ['empty_class_declaration', { line: 59, character: 4 }, 'generation'],
        ],
      ],
    ];

    describe.each(emptyFunctionTestCases)('%s', (language, fileExt, cases) => {
      it.each(cases)('should resolve %s intent correctly', async (_, position, expectedIntent) => {
        const fixturePath = getFixturePath('intent', `empty_function/${language}${fileExt}`);
        const treeAndTestFile = await getTreeAndTestFile({
          fixturePath,
          position,
          languageId: language,
        });
        if (!treeAndTestFile) {
          throw new Error('Failed to get tree and test file');
        }
        const { treeAndLanguage, prefix, suffix } = treeAndTestFile;
        const intent = await getIntent({ treeAndLanguage, position, prefix, suffix });
        expect(intent.intent).toBe(expectedIntent);
        if (expectedIntent === 'generation') {
          expect(intent.generationType).toBe('empty_function');
        }
      });
    });
  });
});
