import fs from 'fs/promises';
import { NullLogger } from '@gitlab-org/logging';
import { DefaultMcpConfigWriter } from './writer';

jest.mock('fs/promises');

describe('DefaultMcpConfigWriter', () => {
  const mockedAccess = jest.mocked(fs.access);
  const mockedReadFile = jest.mocked(fs.readFile);
  const mockedWriteFile = jest.mocked(fs.writeFile);
  const mockedMkdir = jest.mocked(fs.mkdir);

  const filePath = '/tmp/duo/mcp.json';
  let writer: DefaultMcpConfigWriter;

  beforeEach(() => {
    writer = new DefaultMcpConfigWriter(new NullLogger());
  });

  afterEach(() => {
    jest.resetAllMocks();
  });

  describe('ensureConfigFile', () => {
    describe('when the file does not exist', () => {
      beforeEach(() => {
        const enoent = Object.assign(new Error('ENOENT'), { code: 'ENOENT' });
        mockedAccess.mockRejectedValue(enoent);
        mockedMkdir.mockResolvedValue(undefined);
        mockedWriteFile.mockResolvedValue(undefined);
      });

      it('creates the parent directory recursively', async () => {
        await writer.ensureConfigFile(filePath);

        expect(mockedMkdir).toHaveBeenCalledWith('/tmp/duo', { recursive: true });
      });

      it.each([
        ['no options are given (default)', undefined],
        ['called with `managed: true`', { managed: true }],
      ])('writes a template that includes `_managed: true` when %s', async (_, options) => {
        await writer.ensureConfigFile(filePath, options);

        const [, content] = mockedWriteFile.mock.calls[0];
        expect(content).toContain('"_managed": true');
        expect(content).toContain('"mcpServers": {');
      });

      describe('when called with `managed: false`', () => {
        beforeEach(async () => {
          await writer.ensureConfigFile(filePath, { managed: false });
        });

        it('writes a template WITHOUT the `_managed` field', () => {
          const [, content] = mockedWriteFile.mock.calls[0];
          expect(content).not.toContain('_managed');
          expect(content).toContain('"mcpServers": {');
        });

        it('still includes the helpful comment guiding the user', () => {
          const [, content] = mockedWriteFile.mock.calls[0];
          expect(content).toContain('// Add your MCP server configurations here');
        });
      });
    });

    describe('when the file already exists with a valid structure', () => {
      beforeEach(() => {
        mockedAccess.mockResolvedValue(undefined);
        mockedReadFile.mockResolvedValue('{ "mcpServers": {} }');
      });

      it('does not write anything (no-op)', async () => {
        await writer.ensureConfigFile(filePath, { managed: false });

        expect(mockedWriteFile).not.toHaveBeenCalled();
        expect(mockedMkdir).not.toHaveBeenCalled();
      });
    });

    describe('when the file exists but has invalid structure', () => {
      beforeEach(() => {
        mockedAccess.mockResolvedValue(undefined);
        mockedReadFile.mockResolvedValue('this is not json');
        mockedMkdir.mockResolvedValue(undefined);
        mockedWriteFile.mockResolvedValue(undefined);
      });

      describe('when managed (the default)', () => {
        it('reinitialises the file with the managed template', async () => {
          await writer.ensureConfigFile(filePath, { managed: true });

          const [, content] = mockedWriteFile.mock.calls[0];
          expect(content).toContain('"_managed": true');
        });
      });

      describe('when unmanaged', () => {
        it('leaves the file untouched rather than discarding its contents', async () => {
          await writer.ensureConfigFile(filePath, { managed: false });

          expect(mockedWriteFile).not.toHaveBeenCalled();
        });
      });
    });
  });
});
