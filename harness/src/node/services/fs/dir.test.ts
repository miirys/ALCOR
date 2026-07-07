import { sep } from 'path';
import { fdir as FastDirectoryCrawler } from 'fdir';
import { fsPathFromUri, fsPathToUri } from '@gitlab-org/fs';
import { DesktopDirectoryWalker } from './dir';

jest.mock('fdir');
jest.mock('../../../common/log');
jest.mock('perf_hooks', () => ({
  performance: {
    now: jest.fn(),
  },
}));
jest.mock('@gitlab-org/fs', () => {
  const actual = jest.requireActual('@gitlab-org/fs');
  return {
    ...actual,
    fsPathFromUri: jest.fn(actual.fsPathFromUri),
    fsPathToUri: jest.fn(actual.fsPathToUri),
  };
});

const buildExpectedPath = (path: string) => {
  return path.replaceAll('/', sep);
};

describe('DesktopDirectoryWalker', () => {
  let directoryWalker: DesktopDirectoryWalker;

  const searchedDirectory = {
    filters: {
      fileEndsWith: ['.txt', '.js'],
    },
    directoryUri: fsPathToUri(buildExpectedPath('/path/to/directory')),
  };

  beforeEach(() => {
    directoryWalker = new DesktopDirectoryWalker();
  });

  const mockFastDirectoryCrawler = (mockPaths: string[]) => {
    jest.mocked(FastDirectoryCrawler as jest.Mock).mockReturnValue({
      withFullPaths: jest.fn().mockReturnThis(),
      filter: jest.fn().mockImplementation((callback) => {
        mockPaths.forEach((path) => callback(path));
        return new FastDirectoryCrawler();
      }),
      crawl: jest.fn().mockReturnThis(),
      withPromise: jest.fn().mockResolvedValue(mockPaths),
    });
  };

  const expectToCrawlDirectory = (path: string) => {
    expect(FastDirectoryCrawler).toHaveBeenCalled();
    const builder = new FastDirectoryCrawler();
    expect(builder.withFullPaths).toHaveBeenCalled();
    expect(builder.filter).toHaveBeenCalled();
    expect(builder.crawl).toHaveBeenCalledWith(path);
    expect(builder.crawl('').withPromise).toHaveBeenCalled();
  };

  describe('findFilesForDirectory', () => {
    it('should return an array of file paths that match the specified criteria', async () => {
      const mockPaths = [
        buildExpectedPath('/path/to/file1.txt'),
        buildExpectedPath('/path/to/file2.js'),
      ];
      const mockUris = expect.arrayContaining([
        expect.objectContaining({ fsPath: mockPaths[0], scheme: 'file' }),
        expect.objectContaining({ fsPath: mockPaths[1], scheme: 'file' }),
      ]);

      mockFastDirectoryCrawler(mockPaths);

      const result = await directoryWalker.findFilesForDirectory(searchedDirectory);

      expectToCrawlDirectory(buildExpectedPath('/path/to/directory'));

      expect(fsPathToUri).toHaveBeenCalledTimes(2);
      expect(result).toEqual(mockUris);
    });

    it('should return an empty array if no files match the specified criteria', async () => {
      const mockPaths: string[] = [];

      mockFastDirectoryCrawler(mockPaths);

      const result = await directoryWalker.findFilesForDirectory(searchedDirectory);
      const expectedPath = buildExpectedPath('/path/to/directory');

      expectToCrawlDirectory(expectedPath);
      expect(fsPathFromUri).toHaveBeenCalledWith(
        expect.objectContaining({
          fsPath: expectedPath,
          scheme: 'file',
        }),
      );
      expect(result).toEqual([]);
    });

    it('should handle windows encoded file URI', async () => {
      const windowsEncodedPath = fsPathToUri(
        'file:///c%3A/Users/jdsla/Development/gitlab/gitlab-lsp',
      );
      const mockPath = 'C:\\path\\to\\file.txt';
      const mockPaths = [mockPath];
      mockFastDirectoryCrawler(mockPaths);

      const result = await directoryWalker.findFilesForDirectory({
        directoryUri: windowsEncodedPath,
        filters: {
          // pass in a unix style path
          fileEndsWith: ['/.txt'],
        },
      });

      expect(fsPathFromUri).toHaveBeenCalledWith(windowsEncodedPath);
      expect(fsPathToUri).toHaveBeenCalledWith('C:\\path\\to\\file.txt');
      expect(result).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fsPath: 'c:\\path\\to\\file.txt',
            scheme: 'file',
          }),
        ]),
      );
    });
  });
});
