import { promises as fs } from 'fs';
import path from 'path';
import { File } from './txtar';

export const writeArchive = async (basePath: string, files: File[]): Promise<void> => {
  await Promise.all(
    files.map(async (file: File) => {
      const filePath = path.join(basePath, file.name);
      const dirPath = path.dirname(filePath);

      await fs.mkdir(dirPath, { recursive: true });
      await fs.writeFile(filePath, file.content, 'utf8');
    }),
  );
};
