import { join } from 'node:path';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import { FileAccessService } from '@gitlab-org/fs';
import { EditFileFormatter } from './edit_file';
import type { ToolInputFormatContext } from './index';

describe('EditFileFormatter', () => {
  let formatter: EditFileFormatter;
  let mockFileAccessService: FileAccessService;

  const workspaceFolderPath = '/path/to/folder';
  const filepath = 'some/file.ts';
  const oldString = 'old content';
  const newString = 'new content';
  const fullFilePath = join(workspaceFolderPath, filepath);

  let args: Record<string, unknown>;
  let formatContext: ToolInputFormatContext;

  beforeEach(() => {
    mockFileAccessService = createFakePartial<FileAccessService>({
      getText: jest.fn(),
    });

    formatter = new EditFileFormatter(new TestLogger(), [mockFileAccessService]);

    args = {
      file_path: filepath,
      old_str: oldString,
      new_str: newString,
    };
    formatContext = { workspaceFolderPath, toolName: 'edit_file' };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('exposes the edit_file tool name', () => {
    expect(formatter.toolName).toBe('edit_file');
  });

  describe('when file can be read successfully', () => {
    const originalFileContent = `This is a file with ${oldString} that will be modified`;

    beforeEach(() => {
      jest.mocked(mockFileAccessService.getText).mockResolvedValue(originalFileContent);
    });

    it('should return full file diff with original and updated content', async () => {
      const result = await formatter.format(args, formatContext);

      expect(mockFileAccessService.getText).toHaveBeenCalledWith(fullFilePath);
      expect(result).toEqual({
        tool: 'edit_file',
        filepath,
        diff: {
          old: {
            filepath,
            content: originalFileContent,
          },
          new: {
            filepath,
            content: `This is a file with ${newString} that will be modified`,
          },
        },
      });
    });
  });

  describe('when file already contains the edited content', () => {
    const editedFileContent = `This is a file with ${newString} that was already modified`;

    beforeEach(() => {
      jest.mocked(mockFileAccessService.getText).mockResolvedValue(editedFileContent);
    });

    it('should reconstruct original content for diff display', async () => {
      const result = await formatter.format(args, formatContext);

      expect(result).toEqual({
        tool: 'edit_file',
        filepath,
        diff: {
          old: {
            filepath,
            content: `This is a file with ${oldString} that was already modified`,
          },
          new: {
            filepath,
            content: editedFileContent,
          },
        },
      });
    });
  });

  describe('when file has not been edited yet', () => {
    const uneditedFileContent = `This is a file with ${oldString} that will be modified`;

    beforeEach(() => {
      jest.mocked(mockFileAccessService.getText).mockResolvedValue(uneditedFileContent);
    });

    it('should show original content and preview the edit', async () => {
      const result = await formatter.format(args, formatContext);

      expect(result).toEqual({
        tool: 'edit_file',
        filepath,
        diff: {
          old: {
            filepath,
            content: uneditedFileContent,
          },
          new: {
            filepath,
            content: `This is a file with ${newString} that will be modified`,
          },
        },
      });
    });
  });

  describe('when the file uses CRLF but args use LF line endings', () => {
    const crlfContent = `line one\r\n${oldString}\r\nline three`;

    beforeEach(() => {
      jest.mocked(mockFileAccessService.getText).mockResolvedValue(crlfContent);
      args = {
        file_path: filepath,
        old_str: oldString,
        new_str: newString,
      };
    });

    it('produces a non-identical diff and preserves CRLF', async () => {
      const result = await formatter.format(args, formatContext);

      expect(result).toEqual({
        tool: 'edit_file',
        filepath,
        diff: {
          old: { filepath, content: crlfContent },
          new: { filepath, content: `line one\r\n${newString}\r\nline three` },
        },
      });
    });
  });

  describe('when file_path is missing from the args', () => {
    beforeEach(() => {
      args = {
        old_str: oldString,
        new_str: newString,
      };
    });

    it('rejects so the dispatcher can fall back to the generic display', async () => {
      await expect(formatter.format(args, formatContext)).rejects.toThrow();
    });
  });

  it.each([
    ['all fields missing', {}],
    ['old_str missing', { file_path: filepath, new_str: newString }],
    ['file_path a number', { file_path: 42, old_str: oldString, new_str: newString }],
  ])('rejects on %s', async (_label, invalidArgs) => {
    await expect(formatter.format(invalidArgs, formatContext)).rejects.toThrow();
  });

  describe('when file cannot be read', () => {
    beforeEach(() => {
      jest.mocked(mockFileAccessService.getText).mockRejectedValue(new Error('File read error'));
    });

    it('should fall back to fragment diff', async () => {
      const result = await formatter.format(args, formatContext);

      expect(mockFileAccessService.getText).toHaveBeenCalledWith(fullFilePath);
      expect(result).toEqual({
        tool: 'edit_file',
        filepath,
        diff: {
          old: {
            filepath,
            content: oldString,
          },
          new: {
            filepath,
            content: newString,
          },
        },
      });
    });
  });
});
