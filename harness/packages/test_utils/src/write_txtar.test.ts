import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import path from 'path';
import { File } from './txtar';
import { writeArchive } from './write_txtar';

describe('writeArchive', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(tmpdir(), 'txtar-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should write archive files with subdirectories to filesystem', async () => {
    const files: File[] = [
      { name: 'root.txt', content: 'root file content' },
      { name: 'deep/nested/path/file.txt', content: 'nested content' },
    ];

    await writeArchive(tempDir, files);

    const rootContent = await fs.readFile(path.join(tempDir, 'root.txt'), 'utf8');
    expect(rootContent).toBe('root file content');

    const nestedContent = await fs.readFile(
      path.join(tempDir, 'deep/nested/path/file.txt'),
      'utf8',
    );
    expect(nestedContent).toBe('nested content');

    const deepDir = await fs.stat(path.join(tempDir, 'deep/nested/path'));
    expect(deepDir.isDirectory()).toBe(true);
  });
});
