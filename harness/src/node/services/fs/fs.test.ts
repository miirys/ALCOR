import { FileHandle } from 'node:fs/promises';
import * as fs from 'fs';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DesktopFsClient } from './fs';

jest.mock('fs', () => ({
  promises: {
    open: jest.fn(),
    readFile: jest.fn(),
    writeFile: jest.fn(),
    unlink: jest.fn(),
    readdir: jest.fn(),
    mkdir: jest.fn(),
    rmdir: jest.fn(),
    stat: jest.fn(),
    lstat: jest.fn(),
    access: jest.fn(),
    chmod: jest.fn(),
    readlink: jest.fn(),
    symlink: jest.fn(),
  },
}));

describe('DesktopFsClient', () => {
  let client: DesktopFsClient;
  let mockFileHandle: FileHandle;

  beforeEach(() => {
    client = new DesktopFsClient();
    mockFileHandle = createFakePartial<FileHandle>({
      read: jest.fn(),
      close: jest.fn(),
    });
    jest.mocked(fs.promises.open).mockResolvedValue(mockFileHandle);
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('readFileFirstBytes', () => {
    it('should read only the specified number of bytes', async () => {
      const filePath = '/path/to/file.txt';
      const maxBytes = 5;

      jest.mocked(mockFileHandle.read).mockImplementation(((
        buffer: Buffer,
        _offset: number,
        length: number,
      ) => {
        buffer.write('Hello World', 0, length);
        return Promise.resolve({
          bytesRead: length,
          buffer,
        });
      }) as FileHandle['read']);

      const result = await client.promises.readFileFirstBytes(filePath, maxBytes);

      expect(fs.promises.open).toHaveBeenCalledWith(filePath, 'r');
      expect(mockFileHandle.read).toHaveBeenCalledWith(expect.any(Buffer), 0, maxBytes);
      expect(result).toBe('Hello');
      expect(mockFileHandle.close).toHaveBeenCalled();
    });

    it('should handle partial reads when file is smaller than maxBytes', async () => {
      const filePath = '/path/to/file.txt';
      const content = 'Hi';
      const maxBytes = 10;
      const bytesRead = content.length;

      jest.mocked(mockFileHandle.read).mockImplementation(((buffer: Buffer) => {
        buffer.write(content, 0, bytesRead);
        return Promise.resolve({
          bytesRead,
          buffer,
        });
      }) as FileHandle['read']);

      const result = await client.promises.readFileFirstBytes(filePath, maxBytes);

      expect(result).toBe('Hi');
      expect(mockFileHandle.close).toHaveBeenCalled();
    });

    it('should close file handle even if read fails', async () => {
      const filePath = '/path/to/file.txt';
      const maxBytes = 5;

      jest.mocked(mockFileHandle.read).mockRejectedValue(new Error('Read failed'));

      await expect(client.promises.readFileFirstBytes(filePath, maxBytes)).rejects.toThrow(
        'Read failed',
      );
      expect(mockFileHandle.close).toHaveBeenCalled();
    });

    it('should propagate any file handle open errors', async () => {
      const filePath = '/path/to/file.txt';
      const maxBytes = 5;

      jest.mocked(fs.promises.open).mockRejectedValue(new Error('Failed to open file'));

      await expect(client.promises.readFileFirstBytes(filePath, maxBytes)).rejects.toThrow(
        'Failed to open file',
      );
    });
  });
});
