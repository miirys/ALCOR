import { join } from 'path';
import ts from 'typescript';
import { URI } from 'vscode-uri';
import { FileChangeType } from 'vscode-languageserver-protocol';
import type { WorkspaceFolder } from 'vscode-languageserver-protocol';
import { RepositoryFile, RepositoryService } from '@gitlab-org/repositories';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { ExtendedPromiseFsClient, FsClient } from '../../../../../../../services/fs/fs';
import type { Repository } from '../../../../../../../services/git/repository';
import { DefaultTsConfigStore } from './tsconfig_store';

jest.mock('typescript', () => ({
  readConfigFile: jest.fn(),
  parseJsonConfigFileContent: jest.fn(),
}));

describe('TsConfigStore', () => {
  let tsConfigStore: DefaultTsConfigStore;
  let mockFsClient: FsClient;
  let mockRepositoryService: RepositoryService;
  let mockRepository: Repository;
  let mockLogger: TestLogger;

  const repoUri = URI.parse('file:///repo');

  const createMockRepositoryFile = (uri: string): RepositoryFile => ({
    uri: URI.parse(uri),
    repositoryUri: repoUri,
    isIgnored: false,
    workspaceFolder: { uri: 'file:///repo', name: 'repo' },
    dirUri: () =>
      URI.parse(uri).with({ path: URI.parse(uri).path.split('/').slice(0, -1).join('/') }),
  });

  const createWorkspaceFolder = (uri: string): WorkspaceFolder => ({
    uri,
    name: uri.split('/').pop() || 'repo',
  });

  const createWildcardDirs = (paths: string[], basePath?: string): Record<string, number> => {
    const tsWatchDirFlagRecursive = 1;
    return Object.fromEntries(
      paths.map((p) => [join(basePath ?? repoUri.fsPath, p), tsWatchDirFlagRecursive]),
    );
  };

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockFsClient = createFakePartial<FsClient>({
      promises: createFakePartial<ExtendedPromiseFsClient['promises']>({
        readFile: jest.fn().mockResolvedValue(Buffer.from('{}')),
        readdir: jest.fn(),
      }),
    });

    mockRepository = createFakePartial<Repository>({
      uri: repoUri,
      getCurrentTreeFiles: jest.fn(),
      getFile: jest.fn(),
    });

    mockRepositoryService = createFakePartial<RepositoryService>({
      onFileChange: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      onWorkspaceRepositoriesStart: jest.fn().mockReturnValue({ dispose: jest.fn() }),
      getMatchingRepository: jest.fn(),
    });

    jest.mocked(ts.readConfigFile).mockReset();
    jest.mocked(ts.parseJsonConfigFileContent).mockReset();

    tsConfigStore = new DefaultTsConfigStore(mockLogger, mockFsClient, mockRepositoryService);
  });

  afterEach(() => tsConfigStore.dispose());

  describe('config file discovery', () => {
    it('finds tsconfig.json files and ignores node_modules', async () => {
      jest.mocked(ts.readConfigFile).mockReturnValue({ config: {} });
      jest.mocked(ts.parseJsonConfigFileContent).mockReturnValue(
        createFakePartial<ts.ParsedCommandLine>({
          fileNames: [],
          options: {},
        }),
      );
      jest
        .mocked(mockRepository.getCurrentTreeFiles)
        .mockReturnValue([
          createMockRepositoryFile('file:///repo/tsconfig.json'),
          createMockRepositoryFile('file:///repo/src/tsconfig.json'),
          createMockRepositoryFile('file:///repo/node_modules/foo/tsconfig.json'),
          createMockRepositoryFile('file:///repo/other.json'),
        ]);

      await tsConfigStore.findApplicableConfig('file:///repo/src/test.ts', mockRepository);

      expect(ts.readConfigFile).toHaveBeenCalledTimes(2);
      expect(ts.readConfigFile).toHaveBeenCalledWith(
        URI.parse('file:///repo/tsconfig.json').fsPath,
        expect.any(Function),
      );
      expect(ts.readConfigFile).toHaveBeenCalledWith(
        URI.parse('file:///repo/src/tsconfig.json').fsPath,
        expect.any(Function),
      );
    });

    describe('error handling', () => {
      const testFile = 'file:///repo/src/test.ts';
      const testFileFsPath = URI.parse(testFile).fsPath;

      describe('file reading errors', () => {
        it('continues processing remaining config files if one file fails to read', async () => {
          jest
            .mocked(mockRepository.getCurrentTreeFiles)
            .mockReturnValue([
              createMockRepositoryFile('file:///repo/tsconfig.json'),
              createMockRepositoryFile('file:///repo/src/tsconfig.json'),
            ]);

          jest
            .mocked(mockFsClient.promises.readFile)
            .mockRejectedValueOnce(new Error('Failed to read'))
            .mockResolvedValueOnce(Buffer.from('{}'));

          jest.mocked(ts.readConfigFile).mockReturnValueOnce({ config: {} });

          jest.mocked(ts.parseJsonConfigFileContent).mockReturnValueOnce(
            createFakePartial<ts.ParsedCommandLine>({
              fileNames: [testFileFsPath],
              options: {},
            }),
          );

          const result = await tsConfigStore.findApplicableConfig(testFile, mockRepository);

          expect(result).not.toBeNull();
          expect(ts.parseJsonConfigFileContent).toHaveBeenCalledTimes(1);
        });
      });

      describe('parsing errors', () => {
        beforeEach(() => {
          jest.mocked(mockFsClient.promises.readFile).mockResolvedValue(Buffer.from('{}'));
        });

        it('continues if readConfigFile fails for one config', async () => {
          jest
            .mocked(mockRepository.getCurrentTreeFiles)
            .mockReturnValue([
              createMockRepositoryFile('file:///repo/tsconfig.json'),
              createMockRepositoryFile('file:///repo/src/tsconfig.json'),
            ]);

          jest
            .mocked(ts.readConfigFile)
            .mockImplementationOnce(() => {
              throw new Error('Parse failed');
            })
            .mockReturnValueOnce({ config: {} });

          jest.mocked(ts.parseJsonConfigFileContent).mockReturnValueOnce(
            createFakePartial<ts.ParsedCommandLine>({
              fileNames: [testFileFsPath],
              options: {},
            }),
          );

          const result = await tsConfigStore.findApplicableConfig(testFile, mockRepository);

          expect(result).not.toBeNull();
          expect(ts.parseJsonConfigFileContent).toHaveBeenCalledTimes(1);
        });

        it('continues if parseJsonConfigFileContent fails for one config', async () => {
          jest
            .mocked(mockRepository.getCurrentTreeFiles)
            .mockReturnValue([
              createMockRepositoryFile('file:///repo/tsconfig.json'),
              createMockRepositoryFile('file:///repo/src/tsconfig.json'),
            ]);

          jest.mocked(ts.readConfigFile).mockReturnValue({ config: {} });

          jest
            .mocked(ts.parseJsonConfigFileContent)
            .mockImplementationOnce(() => {
              throw new Error('Parse failed');
            })
            .mockReturnValueOnce(
              createFakePartial<ts.ParsedCommandLine>({
                fileNames: [testFileFsPath],
                options: {},
              }),
            );

          const result = await tsConfigStore.findApplicableConfig(testFile, mockRepository);

          expect(result).not.toBeNull();
        });
      });
    });
  });

  describe('config matching', () => {
    describe('exact matches', () => {
      it.each([
        {
          desc: 'matches TypeScript file with exact path in tsconfig',
          filePath: 'file:///repo/src/exact.ts',
          configType: 'tsconfig.json',
          config: {
            fileNames: [URI.parse('file:///repo/src/exact.ts').fsPath],
            options: {},
            wildcardDirectories: {},
          },
        },
        {
          desc: 'matches JavaScript file with exact path in jsconfig',
          filePath: 'file:///repo/src/exact.js',
          configType: 'jsconfig.json',
          config: {
            fileNames: [URI.parse('file:///repo/src/exact.js').fsPath],
            options: {},
            wildcardDirectories: {},
          },
        },
      ])('$desc', async ({ filePath, configType, config }) => {
        jest
          .mocked(mockRepository.getCurrentTreeFiles)
          .mockReturnValue([createMockRepositoryFile(`file:///repo/${configType}`)]);

        jest.mocked(ts.readConfigFile).mockReturnValue({ config: {} });

        jest
          .mocked(ts.parseJsonConfigFileContent)
          .mockReturnValue(createFakePartial<ts.ParsedCommandLine>(config));

        const result = await tsConfigStore.findApplicableConfig(filePath, mockRepository);
        expect(result).not.toBeNull();
      });
    });

    describe('wildcard matches for TypeScript files', () => {
      it.each([
        {
          desc: 'matches .ts file in tsconfig wildcard directory',
          filePath: 'file:///repo/src/code/file.ts',
          configType: 'tsconfig.json',
          config: {
            fileNames: [],
            options: {},
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
        {
          desc: 'matches .tsx file in tsconfig wildcard directory',
          filePath: 'file:///repo/src/code/file.tsx',
          configType: 'tsconfig.json',
          config: {
            fileNames: [],
            options: {},
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
      ])('$desc', async ({ filePath, configType, config }) => {
        jest
          .mocked(mockRepository.getCurrentTreeFiles)
          .mockReturnValue([createMockRepositoryFile(`file:///repo/${configType}`)]);

        jest.mocked(ts.readConfigFile).mockReturnValue({ config: {} });

        jest
          .mocked(ts.parseJsonConfigFileContent)
          .mockReturnValue(createFakePartial<ts.ParsedCommandLine>(config));

        const result = await tsConfigStore.findApplicableConfig(filePath, mockRepository);
        expect(result).not.toBeNull();
      });
    });

    describe('wildcard matches for JavaScript files', () => {
      it.each([
        {
          desc: 'matches .js file in tsconfig with allowJs',
          filePath: 'file:///repo/src/code/file.js',
          configType: 'tsconfig.json',
          config: {
            fileNames: [],
            options: { allowJs: true },
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
        {
          desc: 'matches .jsx file in tsconfig with allowJs',
          filePath: 'file:///repo/src/code/file.jsx',
          configType: 'tsconfig.json',
          config: {
            fileNames: [],
            options: { allowJs: true },
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
        {
          desc: 'matches .js file in jsconfig (implicit allowJs)',
          filePath: 'file:///repo/src/code/file.js',
          configType: 'jsconfig.json',
          config: {
            fileNames: [],
            options: {},
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
        {
          desc: 'matches .jsx file in jsconfig (implicit allowJs)',
          filePath: 'file:///repo/src/code/file.jsx',
          configType: 'jsconfig.json',
          config: {
            fileNames: [],
            options: {},
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
        {
          desc: 'matches .vue file in jsconfig (implicit allowJs)',
          filePath: 'file:///repo/src/code/file.vue',
          configType: 'jsconfig.json',
          config: {
            fileNames: [],
            options: {},
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
      ])('$desc', async ({ filePath, configType, config }) => {
        jest
          .mocked(mockRepository.getCurrentTreeFiles)
          .mockReturnValue([createMockRepositoryFile(`file:///repo/${configType}`)]);

        jest.mocked(ts.readConfigFile).mockReturnValue({ config: {} });

        jest
          .mocked(ts.parseJsonConfigFileContent)
          .mockReturnValue(createFakePartial<ts.ParsedCommandLine>(config));

        const result = await tsConfigStore.findApplicableConfig(filePath, mockRepository);
        expect(result).not.toBeNull();
      });
    });

    describe('when file is outside any config', () => {
      it.each([
        {
          desc: 'does not match file outside of wildcard directory',
          filePath: 'file:///repo/outside-src/file.ts',
          configType: 'tsconfig.json',
          config: {
            fileNames: [],
            options: {},
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
        // TODO: tsconfig `excludes` not yet supported: https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/835
        // {
        //   desc: 'does not match file in excluded directory',
        //   filePath: 'file:///repo/src/excluded/file.ts',
        //   configType: 'tsconfig.json',
        //   config: {
        //     fileNames: [],
        //     options: {},
        //     wildcardDirectories: createWildcardDirs(['src']),
        //     raw: { exclude: ['src/excluded/**/*'] }
        //   }
        // }
      ])('$desc', async ({ filePath, configType, config }) => {
        jest
          .mocked(mockRepository.getCurrentTreeFiles)
          .mockReturnValue([createMockRepositoryFile(`file:///repo/${configType}`)]);

        jest.mocked(ts.readConfigFile).mockReturnValue({ config: {} });

        jest
          .mocked(ts.parseJsonConfigFileContent)
          .mockReturnValue(createFakePartial<ts.ParsedCommandLine>(config));

        const result = await tsConfigStore.findApplicableConfig(filePath, mockRepository);
        expect(result).toBeNull();
      });
    });

    describe('non-matching files', () => {
      it.each([
        {
          desc: 'does not match .js file in tsconfig without allowJs',
          filePath: 'file:///repo/src/code/file.js',
          configType: 'tsconfig.json',
          config: {
            fileNames: [],
            options: { allowJs: false },
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
        {
          desc: 'does not match .jsx file in tsconfig without allowJs',
          filePath: 'file:///repo/src/code/file.jsx',
          configType: 'tsconfig.json',
          config: {
            fileNames: [],
            options: { allowJs: false },
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
        {
          desc: 'does not match .vue file in tsconfig without allowJs',
          filePath: 'file:///repo/src/code/file.vue',
          configType: 'tsconfig.json',
          config: {
            fileNames: [],
            options: { allowJs: false },
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
        {
          desc: 'does not match an extensionless file',
          filePath: 'file:///repo/src/code/file',
          configType: 'tsconfig.json',
          config: {
            fileNames: [],
            options: { allowJs: true },
            wildcardDirectories: createWildcardDirs(['src']),
          },
        },
      ])('$desc', async ({ filePath, configType, config }) => {
        jest
          .mocked(mockRepository.getCurrentTreeFiles)
          .mockReturnValue([createMockRepositoryFile(`file:///repo/${configType}`)]);

        jest.mocked(ts.readConfigFile).mockReturnValue({ config: {} });

        jest
          .mocked(ts.parseJsonConfigFileContent)
          .mockReturnValue(createFakePartial<ts.ParsedCommandLine>(config));

        const result = await tsConfigStore.findApplicableConfig(filePath, mockRepository);
        expect(result).toBeNull();
      });
    });

    describe('multiple config resolution', () => {
      it('matches most specific config for nested directories', async () => {
        jest
          .mocked(mockRepository.getCurrentTreeFiles)
          .mockReturnValue([
            createMockRepositoryFile('file:///repo/tsconfig.json'),
            createMockRepositoryFile('file:///repo/packages/lib/tsconfig.json'),
          ]);

        jest.mocked(ts.readConfigFile).mockReturnValue({
          config: {},
        });

        jest.mocked(ts.parseJsonConfigFileContent).mockImplementation((_, __, basePath) => {
          return createFakePartial<ts.ParsedCommandLine>({
            fileNames: [],
            options: {},
            wildcardDirectories: createWildcardDirs(['src'], basePath),
          });
        });

        const result = await tsConfigStore.findApplicableConfig(
          'file:///repo/packages/lib/src/file.ts',
          mockRepository,
        );

        expect(result).toEqual(
          expect.objectContaining({
            wildcardDirectories: {
              [URI.parse('file:///repo/packages/lib/src').fsPath]: 1,
            },
          }),
        );
      });
    });
  });

  describe('cache management', () => {
    describe('non-extended configs', () => {
      beforeEach(() => {
        jest
          .mocked(mockRepository.getCurrentTreeFiles)
          .mockReturnValue([createMockRepositoryFile('file:///repo/tsconfig.json')]);
        jest.mocked(ts.readConfigFile).mockReturnValue({ config: {} });
        jest.mocked(ts.parseJsonConfigFileContent).mockReturnValue(
          createFakePartial<ts.ParsedCommandLine>({
            fileNames: [],
            options: {},
          }),
        );
        jest.mocked(mockRepositoryService.getMatchingRepository).mockResolvedValue(mockRepository);
      });

      it('caches parsed configs', async () => {
        await tsConfigStore.findApplicableConfig('file:///repo/src/test.ts', mockRepository);
        await tsConfigStore.findApplicableConfig('file:///repo/src/test.ts', mockRepository);

        expect(ts.readConfigFile).toHaveBeenCalledTimes(1);
      });

      it('invalidates cache on config file change', async () => {
        await tsConfigStore.findApplicableConfig('file:///repo/src/test.ts', mockRepository);

        const fileChangeHandler = jest.mocked(mockRepositoryService.onFileChange).mock.calls[0][0];
        await fileChangeHandler({
          fileEvent: {
            uri: 'file:///repo/tsconfig.json',
            type: FileChangeType.Changed,
          },
          workspaceFolder: createWorkspaceFolder('file:///repo'),
        });

        await tsConfigStore.findApplicableConfig('file:///repo/src/test.ts', mockRepository);

        expect(ts.readConfigFile).toHaveBeenCalledTimes(2);
      });

      it('clears cache on workspace change', async () => {
        await tsConfigStore.findApplicableConfig('file:///repo/src/test.ts', mockRepository);

        const workspaceChangeHandler = jest.mocked(
          mockRepositoryService.onWorkspaceRepositoriesStart,
        ).mock.calls[0][0];
        workspaceChangeHandler(createWorkspaceFolder('file:///repo'));

        await tsConfigStore.findApplicableConfig('file:///repo/src/test.ts', mockRepository);

        expect(ts.readConfigFile).toHaveBeenCalledTimes(2);
      });
    });

    describe('extended configs', () => {
      beforeEach(() => {
        jest.mocked(mockRepositoryService.getMatchingRepository).mockResolvedValue(mockRepository);

        jest
          .mocked(mockRepository.getCurrentTreeFiles)
          .mockReturnValue([
            createMockRepositoryFile('file:///repo/tsconfig.json'),
            createMockRepositoryFile('file:///repo/tsconfig.base.json'),
          ]);

        jest
          .mocked(ts.readConfigFile)
          // when first populating the cache:
          .mockReturnValueOnce({ config: { extends: './tsconfig.base.json' } })
          .mockReturnValueOnce({ config: { compilerOptions: { strict: true } } })
          // after cache clear when verifying we re-parse configs:
          .mockReturnValueOnce({ config: { extends: './tsconfig.base.json' } })
          .mockReturnValueOnce({ config: { compilerOptions: { strict: true } } });

        jest.mocked(ts.parseJsonConfigFileContent).mockImplementation((json, host) => {
          // Call the readFile function as typescript would, to ensure we track these 'extends' dependencies. Required for cache-invalidation
          const repoPath = repoUri.fsPath;
          host.readFile?.(join(repoPath, json.extends));

          return createFakePartial<ts.ParsedCommandLine>({
            fileNames: [],
            options: {},
          });
        });
      });

      it('tracks dependencies of extended configs', async () => {
        await tsConfigStore.findApplicableConfig('file:///repo/src/test.ts', mockRepository);

        const fileChangeHandler = jest.mocked(mockRepositoryService.onFileChange).mock.calls[0][0];
        await fileChangeHandler({
          fileEvent: {
            uri: 'file:///repo/tsconfig.base.json',
            type: FileChangeType.Changed,
          },
          workspaceFolder: createWorkspaceFolder('file:///repo'),
        });

        await tsConfigStore.findApplicableConfig('file:///repo/src/test.ts', mockRepository);
        expect(ts.readConfigFile).toHaveBeenCalledTimes(4);
      });
    });
  });
});
