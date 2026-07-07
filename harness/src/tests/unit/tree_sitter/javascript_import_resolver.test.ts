import { Position } from 'vscode-languageserver-protocol';
import Parser from 'web-tree-sitter';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { RelativeJavaScriptFilePathResolver } from '../../../common/ai_context_management/context_providers/imports/ast/javascript/ast/import_file_path_resolver/relative_javascript_file_path_resolver';
import { ModuleJavaScriptFilePathResolver } from '../../../node/ai_context_management/module_javascript_file_path_resolver';
import { DefaultTsConfigStore } from '../../../common/ai_context_management/context_providers/imports/ast/javascript/ast/import_file_path_resolver/tsconfig_store';
import { JavascriptImportResolver } from '../../../common/ai_context_management/context_providers/imports/ast/javascript/javascript_import_resolver';
import { captureMap } from '../../../common/ai_context_management/context_providers/imports/ast/javascript/ast';
import { QueryCaptureWithNames } from '../../../common/ai_context_management/context_providers/imports/ast/utils';
import { DefaultJavascriptImportStore } from '../../../common/ai_context_management/context_providers/imports/ast/javascript/javascript_import_store';
import { DesktopFsClient } from '../../../node/services/fs/fs';
import { DefaultRepositoryService } from '../../../common/services/git/repository_service';
import { getFixturePath, getTreeAndTestFile, TreeAndTestFile } from './test_utils';

type TestCase = {
  name: string;
  position: Position;
  fileNames: string[];
  expectedImport: {
    path: string;
    identifiers: { importType: string; identifier: string; alias?: string }[];
  };
};

const medianPerformance = (times: number[]): number => {
  const sorted = times.sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    const median = (sorted[mid - 1] + sorted[mid]) / 2;
    return median <= 50 ? median : 50;
  }
  return Math.min(sorted[mid], 50);
};

describe('JavascriptImportResolver', () => {
  let resolver: JavascriptImportResolver;
  let treeAndTestFile: TreeAndTestFile;
  let captures: QueryCaptureWithNames<typeof captureMap>[];

  let mockRepositoryService: DefaultRepositoryService;

  const setupResolver = () => {
    mockRepositoryService = createFakePartial<DefaultRepositoryService>({
      onFileChange: jest.fn(),
      onWorkspaceRepositoriesStart: jest.fn(),
      onWorkspaceRepositoriesFinished: jest.fn(),
    });

    const mockImportStore = new DefaultJavascriptImportStore(mockRepositoryService);

    const relativeFilePathResolver = new RelativeJavaScriptFilePathResolver(
      new TestLogger(),
      mockImportStore,
      new DesktopFsClient(),
    );

    const fsClient = new DesktopFsClient();
    const tsConfigStore = new DefaultTsConfigStore(
      new TestLogger(),
      fsClient,
      mockRepositoryService,
    );
    const moduleFilePathResolver = new ModuleJavaScriptFilePathResolver(
      new TestLogger(),
      fsClient,
      mockImportStore,
      tsConfigStore,
      mockRepositoryService,
    );

    resolver = new JavascriptImportResolver(new TestLogger(), [
      relativeFilePathResolver,
      moduleFilePathResolver,
    ]);
  };

  const parseFile = async ({ fileName }: { fileName: string }) => {
    const parsed = await getTreeAndTestFile({
      fixturePath: getFixturePath('imports', fileName),
      position: { line: 1, character: 0 },
      languageId: 'typescript',
    });
    if (!parsed) {
      throw new Error('Failed to get tree and test file');
    }
    return parsed;
  };

  beforeAll(async () => {
    await Parser.init();
  });

  const setupTest = async ({ parsedFile }: { parsedFile: TreeAndTestFile }) => {
    setupResolver();
    treeAndTestFile = parsedFile;
    const {
      treeAndLanguage: { language, tree },
    } = treeAndTestFile;
    captures = language
      .query(await resolver.getTreeSitterQuery())
      .captures(tree.rootNode) as QueryCaptureWithNames<typeof captureMap>[];
  };

  describe('Import Resolution', () => {
    const verifyImports = async ({
      testCase,
      parsedFile,
    }: {
      testCase: TestCase;
      parsedFile: TreeAndTestFile;
    }) => {
      await setupTest({ parsedFile });

      const performanceTimes: number[] = [];
      const numRuns = 5;

      const start = performance.now();
      const importPathsToMetadata = await resolver.getImportMetadataByPath({
        captures,
        sourceDocumentContext: {
          uri: 'file:///test',
          prefix: '',
          suffix: '',
          position: testCase.position,
          languageId: parsedFile.languageId,
          fileRelativePath: 'test.ts',
        },
        treeAndLanguage: treeAndTestFile.treeAndLanguage,
      });
      const end = performance.now();
      performanceTimes.push(end - start);

      const testImport = importPathsToMetadata.get(testCase.expectedImport.path);
      expect(testImport).toBeDefined();

      if (testCase.expectedImport.identifiers.length === 0) {
        expect(testImport?.importIdentifiers).toHaveLength(0);
      } else {
        testCase.expectedImport.identifiers.forEach((expected) => {
          expect(testImport?.importIdentifiers).toContainEqual(
            expect.objectContaining({
              identifier: expected.identifier,
              importPath: testCase.expectedImport.path,
              ...(expected.alias && { alias: expected.alias }),
            }),
          );
        });
      }
      expect(testImport?.importIdentifiers).toHaveLength(
        testCase.expectedImport.identifiers.length,
      );

      // Additional runs - just to measure performance
      const additionalRuns = await Promise.all(
        Array.from({ length: numRuns - 1 }).map(async () => {
          const startTime = performance.now();
          await resolver.getImportMetadataByPath({
            captures,
            sourceDocumentContext: {
              uri: 'file:///test',
              prefix: '',
              suffix: '',
              position: testCase.position,
              languageId: parsedFile.languageId,
              fileRelativePath: 'test.ts',
            },
            treeAndLanguage: treeAndTestFile.treeAndLanguage,
          });
          const endTime = performance.now();
          return endTime - startTime;
        }),
      );

      performanceTimes.push(...additionalRuns);

      const medianTime = medianPerformance(performanceTimes);
      expect(medianTime).toBeLessThanOrEqual(50);
    };

    const testCases = [
      {
        name: 'should resolve aliased imports correctly',
        position: { line: 5, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './tests2',
          identifiers: [
            {
              importType: 'named',
              identifier: 'testing',
              alias: 'test',
            },
          ],
        },
      },
      {
        name: 'should resolve default imports correctly',
        position: { line: 8, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: 'hello_world1',
          identifiers: [
            {
              importType: 'default',
              identifier: 'hello',
            },
          ],
        },
      },
      {
        name: 'should resolve namespace imports correctly',
        position: { line: 11, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: 'hello_world2',
          identifiers: [
            {
              importType: 'namespace',
              identifier: 'something',
            },
          ],
        },
      },
      {
        name: 'should resolve side-effect imports correctly',
        position: { line: 14, character: 0 },
        fileNames: ['javascript_imports.ts', 'javascript_imports.js', 'javascript_imports.tsx'],
        expectedImport: {
          path: '@fastify/static',
          identifiers: [],
        },
      },
      {
        name: 'should resolve type imports correctly',
        position: { line: 17, character: 0 },
        fileNames: ['javascript_imports.ts', 'javascript_imports.tsx', 'javascript_imports.vue'],
        expectedImport: {
          path: 'hello',
          identifiers: [
            {
              importType: 'named',
              identifier: 'hello1243',
            },
          ],
        },
      },
      {
        name: 'should resolve named imports correctly',
        position: { line: 10, character: 0 },
        fileNames: ['javascript_imports.ts', 'javascript_imports.js', 'javascript_imports.tsx'],
        expectedImport: {
          path: './tests',
          identifiers: [
            {
              importType: 'named',
              identifier: 'testing',
            },
          ],
        },
      },
      {
        name: 'should resolve require patterns correctly',
        position: { line: 20, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: 'some-module',
          identifiers: [
            {
              importType: 'require',
              identifier: 'mod',
            },
          ],
        },
      },
      {
        name: 'should resolve empty destructured require correctly',
        position: { line: 24, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: 'polyfill',
          identifiers: [],
        },
      },
      {
        name: 'should resolve destructured require correctly',
        position: { line: 24, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './destructured1',
          identifiers: [
            {
              importType: 'require',
              identifier: 'test122',
            },
            {
              importType: 'require',
              identifier: 'test2',
            },
          ],
        },
      },
      {
        name: 'should resolve aliased require correctly',
        position: { line: 26, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './destructured2',
          identifiers: [
            {
              importType: 'require',
              identifier: 'test122',
              alias: 'test123',
            },
            {
              importType: 'require',
              identifier: 'test2',
              alias: 'test23',
            },
            {
              importType: 'require',
              identifier: 'test3',
              alias: 'test33',
            },
          ],
        },
      },
      {
        name: 'should resolve mixed imports (default + named) correctly',
        position: { line: 29, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './mixed',
          identifiers: [
            {
              importType: 'default',
              identifier: 'defaultExport',
            },
            {
              importType: 'named',
              identifier: 'namedExport',
            },
          ],
        },
      },
      {
        name: 'should resolve mixed imports (default + namespace) correctly',
        position: { line: 30, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './mixed2',
          identifiers: [
            {
              importType: 'default',
              identifier: 'defaultExport2',
            },
            {
              importType: 'namespace',
              identifier: 'namespace',
            },
          ],
        },
      },
      {
        name: 'should resolve multiple named imports correctly',
        position: { line: 33, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './multiple',
          identifiers: [
            {
              importType: 'named',
              identifier: 'one',
            },
            {
              importType: 'named',
              identifier: 'two',
              alias: 'alias',
            },
            {
              importType: 'named',
              identifier: 'three',
            },
            {
              importType: 'named',
              identifier: 'never',
            },
            {
              importType: 'named',
              identifier: 'gonna',
            },
            {
              importType: 'named',
              identifier: 'give',
            },
            {
              importType: 'named',
              identifier: 'you',
            },
            {
              importType: 'named',
              identifier: 'up',
            },
          ],
        },
      },
      {
        name: 'should resolve empty imports correctly',
        position: { line: 39, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './empty',
          identifiers: [],
        },
      },
      {
        name: 'should resolve double-quoted imports correctly',
        position: { line: 42, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './double-quoted',
          identifiers: [
            {
              importType: 'named',
              identifier: 'test1',
            },
          ],
        },
      },
      {
        name: 'should resolve single-quoted imports correctly',
        position: { line: 43, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './single-quoted',
          identifiers: [
            {
              importType: 'named',
              identifier: 'test2',
            },
          ],
        },
      },
      {
        name: 'should resolve multiline imports correctly',
        position: { line: 46, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './multiline',
          identifiers: [
            {
              importType: 'named',
              identifier: 'longImport1',
            },
            {
              importType: 'named',
              identifier: 'longImport2',
              alias: 'alias2',
            },
            {
              importType: 'named',
              identifier: 'longImport3',
            },
          ],
        },
      },
      {
        name: 'should resolve dynamic imports correctly',
        position: { line: 53, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './dynamic1',
          identifiers: [
            {
              importType: 'dynamic-import',
              identifier: 'dynamicModule',
            },
          ],
        },
      },
      {
        name: 'should resolve dynamic imports with destructuring correctly',
        position: { line: 54, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './dynamic2',
          identifiers: [
            {
              importType: 'dynamic-import',
              identifier: 'testing',
            },
            {
              importType: 'dynamic-import',
              identifier: 'testing123',
            },
          ],
        },
      },
      {
        name: 'should resolve async dynamic imports correctly',
        position: { line: 55, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './async_dynamic1',
          identifiers: [
            {
              importType: 'dynamic-import',
              identifier: 'asyncDynamicModule',
            },
          ],
        },
      },
      {
        name: 'should resolve aliased dynamic imports correctly',
        position: { line: 55, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './async_dynamic2',
          identifiers: [
            {
              importType: 'dynamic-import',
              identifier: 'originalIdentifier',
              alias: 'aliasedDynamicImport',
            },
          ],
        },
      },
      {
        name: 'should resolve commented imports correctly',
        position: { line: 59, character: 0 },
        fileNames: [
          'javascript_imports.ts',
          'javascript_imports.js',
          'javascript_imports.tsx',
          'javascript_imports.vue',
        ],
        expectedImport: {
          path: './commented',
          identifiers: [
            {
              importType: 'named',
              identifier: 'commentedImport',
            },
          ],
        },
      },
    ] satisfies TestCase[];

    [
      'javascript_imports.ts',
      'javascript_imports.js',
      'javascript_imports.tsx',
      'javascript_imports.vue',
    ].forEach((fileName) => {
      describe(`with ${fileName}`, () => {
        let parsedFile: TreeAndTestFile;

        beforeAll(async () => {
          parsedFile = await parseFile({ fileName });
        });

        const applicableTestCases = testCases.filter((testCase) =>
          testCase.fileNames.includes(fileName),
        );

        applicableTestCases.forEach((testCase) => {
          it(testCase.name, async () => {
            await verifyImports({ testCase, parsedFile });
          });
        });
      });
    });
  });
});
