import { describe, it, expect, beforeEach, jest } from '@jest/globals';

const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockReadFileSync = jest.fn<(path: string, encoding: string) => string>();
const mockResolve = jest.fn<(...paths: string[]) => string>();
const mockIsAbsolute = jest.fn<(path: string) => boolean>();

jest.unstable_mockModule('node:fs', () => ({
  existsSync: mockExistsSync,
  readFileSync: mockReadFileSync,
}));

jest.unstable_mockModule('node:path', () => ({
  resolve: mockResolve,
  isAbsolute: mockIsAbsolute,
}));

const { parseFlowConfigOption, FlowConfigError } = await import('./flow_config');

describe('parseFlowConfigOption', () => {
  const filePath = './config.yaml';
  const resolvedPath = '/workspace/config.yaml';

  beforeEach(() => {
    mockIsAbsolute.mockReturnValue(false);
    mockResolve.mockReturnValue(resolvedPath);
  });

  describe('when value is empty string', () => {
    it('returns empty string without attempting to resolve', () => {
      expect(parseFlowConfigOption('')).toBe('');
      expect(mockResolve).not.toHaveBeenCalled();
      expect(mockExistsSync).not.toHaveBeenCalled();
      expect(mockReadFileSync).not.toHaveBeenCalled();
    });
  });

  describe('when file exists', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(true);
    });

    describe('when file is readable', () => {
      describe('when content is valid YAML/JSON', () => {
        const validContent = 'version: v1\nname: my-workflow';

        beforeEach(() => {
          mockReadFileSync.mockReturnValue(validContent);
        });

        it('returns the file contents', () => {
          expect(parseFlowConfigOption(filePath)).toBe(validContent);
        });

        it('resolves path and reads file', () => {
          parseFlowConfigOption(filePath);

          expect(mockExistsSync).toHaveBeenCalledWith(resolvedPath);
          expect(mockReadFileSync).toHaveBeenCalledWith(resolvedPath, 'utf-8');
        });

        it('resolves path relative to provided cwd', () => {
          const customCwd = '/custom/workspace';

          parseFlowConfigOption(filePath, customCwd);

          expect(mockResolve).toHaveBeenCalledWith(customCwd, filePath);
        });
      });

      describe('when content is invalid YAML/JSON', () => {
        beforeEach(() => {
          mockReadFileSync.mockReturnValue('invalid: yaml: [unclosed');
        });

        it('throws FlowConfigError with parse error', () => {
          expect(() => parseFlowConfigOption(filePath)).toThrow('Could not parse flow config:');
        });
      });
    });

    describe('when file is not readable', () => {
      beforeEach(() => {
        mockReadFileSync.mockImplementation(() => {
          throw new Error('EACCES: permission denied');
        });
      });

      it('throws FlowConfigError with read failure message', () => {
        expect(() => parseFlowConfigOption(filePath)).toThrow(
          `Could not read flow config file "${resolvedPath}": EACCES: permission denied`,
        );
      });
    });

    describe('when file read throws non Error', () => {
      beforeEach(() => {
        mockReadFileSync.mockImplementation(() => {
          throw { code: 'UNKNOWN' }; // eslint-disable-line @typescript-eslint/only-throw-error
        });
      });

      it('throws FlowConfigError with unknown message', () => {
        expect(() => parseFlowConfigOption(filePath)).toThrow(
          `Could not read flow config file "${resolvedPath}": unknown`,
        );
      });
    });
  });

  describe('when file does not exist', () => {
    beforeEach(() => {
      mockExistsSync.mockReturnValue(false);
    });

    describe('when value looks like a file path', () => {
      it.each(['.yaml', '.yml', '.json'])('throws file not found error for %s extension', (ext) => {
        expect(() => parseFlowConfigOption(`config${ext}`)).toThrow(
          `Flow config file not found: "${resolvedPath}"`,
        );
      });

      it('throws file not found error for explicit relative path (./ prefix)', () => {
        expect(() => parseFlowConfigOption('./path/to/config')).toThrow(
          `Flow config file not found: "${resolvedPath}"`,
        );
      });

      it('throws file not found error for absolute path', () => {
        mockIsAbsolute.mockReturnValue(true);
        const absolutePath = '/absolute/path/config.yaml';
        mockResolve.mockReturnValue(absolutePath);

        expect(() => parseFlowConfigOption(absolutePath)).toThrow(
          `Flow config file not found: "${absolutePath}"`,
        );
      });
    });

    describe('when value is raw content', () => {
      beforeEach(() => {
        mockResolve.mockImplementation((...paths: string[]) => paths[paths.length - 1]);
      });

      it('returns valid YAML content unchanged', () => {
        const yaml = 'version: v1\nname: test';

        expect(parseFlowConfigOption(yaml)).toBe(yaml);
      });

      it('returns valid JSON content unchanged', () => {
        const json = '{"version": "v1", "name": "test"}';

        expect(parseFlowConfigOption(json)).toBe(json);
      });

      it('returns JSON containing path-like strings unchanged', () => {
        const json = '{"foo": "/bar.yaml", "path": "./relative"}';

        expect(parseFlowConfigOption(json)).toBe(json);
      });

      it('treats implicit relative path (without ./) as raw content', () => {
        const implicitRelative = 'path/to/file';

        expect(parseFlowConfigOption(implicitRelative)).toBe(implicitRelative);
      });

      it('throws parse error for malformed YAML', () => {
        const malformed = 'key: [unclosed';

        expect(() => parseFlowConfigOption(malformed)).toThrow('Could not parse flow config:');
      });
    });
  });
});

describe('FlowConfigError', () => {
  it('is an Error with name "FlowConfigError"', () => {
    const error = new FlowConfigError('test message');

    expect(error).toBeInstanceOf(Error);
    expect(error.name).toBe('FlowConfigError');
    expect(error.message).toBe('test message');
  });
});
