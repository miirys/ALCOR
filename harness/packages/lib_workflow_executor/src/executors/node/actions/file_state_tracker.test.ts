import { join } from 'node:path';
import {
  DefaultFileStateTracker,
  DuoFileModifiedSinceLastReadError,
  DuoFileNotReadError,
} from './file_state_tracker';

describe('DefaultFileStateTracker', () => {
  let fileStateTracker: DefaultFileStateTracker;
  const workspaceFolderPath = '/workspace';

  beforeEach(() => {
    fileStateTracker = new DefaultFileStateTracker();
  });

  describe('when file has never been read', () => {
    const filePath = 'test/file.txt';
    const content = 'some content';

    it('should throw DuoFileNotReadError when validating untracked file', () => {
      expect(() => {
        fileStateTracker.assertFileNotModifiedSinceLastRead(workspaceFolderPath, filePath, content);
      }).toThrow(new DuoFileNotReadError(filePath));
    });
  });

  describe('when file is read and validated with same content', () => {
    const filePath = 'test/file.txt';
    const fullFilePath = join(workspaceFolderPath, filePath);
    const content = 'Hello, world!';

    beforeEach(async () => {
      fileStateTracker.recordFileRead(fullFilePath, content);
    });

    it('should pass validation when content matches recorded state', () => {
      expect(() => {
        fileStateTracker.assertFileNotModifiedSinceLastRead(workspaceFolderPath, filePath, content);
      }).not.toThrow();
    });

    it('should handle multiple validations with same content', () => {
      expect(() => {
        fileStateTracker.assertFileNotModifiedSinceLastRead(workspaceFolderPath, filePath, content);
        fileStateTracker.assertFileNotModifiedSinceLastRead(workspaceFolderPath, filePath, content);
      }).not.toThrow();
    });
  });

  describe('when file is read and validated with different content', () => {
    const filePath = 'test/file.txt';
    const fullFilePath = join(workspaceFolderPath, filePath);
    const originalContent = 'Hello, world!';

    beforeEach(async () => {
      fileStateTracker.recordFileRead(fullFilePath, originalContent);
    });

    it('should throw DuoFileModifiedSinceLastReadError when content has changed', () => {
      const modifiedContent = 'Hello, universe!';

      expect(() => {
        fileStateTracker.assertFileNotModifiedSinceLastRead(
          workspaceFolderPath,
          filePath,
          modifiedContent,
        );
      }).toThrow(new DuoFileModifiedSinceLastReadError(filePath));
    });
  });

  describe('edge cases', () => {
    describe('when file is empty', () => {
      const filePath = 'test/empty.txt';
      const fullFilePath = join(workspaceFolderPath, filePath);
      const content = '';

      beforeEach(async () => {
        fileStateTracker.recordFileRead(fullFilePath, content);
      });

      it('should handle empty file content correctly', () => {
        expect(() => {
          fileStateTracker.assertFileNotModifiedSinceLastRead(
            workspaceFolderPath,
            filePath,
            content,
          );
        }).not.toThrow();
      });
    });

    describe('when file contains unicode', () => {
      const filePath = 'test/unicode.txt';
      const fullFilePath = join(workspaceFolderPath, filePath);
      const content = 'Hello 世界! 🌍 Émojis and spëcial chars';

      beforeEach(async () => {
        fileStateTracker.recordFileRead(fullFilePath, content);
      });

      it('should handle unicode content correctly', () => {
        expect(() => {
          fileStateTracker.assertFileNotModifiedSinceLastRead(
            workspaceFolderPath,
            filePath,
            content,
          );
        }).not.toThrow();
      });
    });
  });
});
