import { readFile, stat, writeFile, mkdir, lstat, readlink } from 'node:fs/promises';
import { realpathSync } from 'node:fs';
import { dirname, isAbsolute, resolve } from 'node:path';
import { Injectable } from '@gitlab/needle';
import { DocumentUri, Position, TextEdit } from 'vscode-languageserver-protocol';
import { FileAccessService, FileNotFoundError, FS_PRIORITY } from '../index';

const handleFileErrorAndThrow = (path: string) => (e: unknown) => {
  if (e !== null && typeof e === 'object' && 'code' in e && e.code === 'ENOENT') {
    throw new FileNotFoundError(path, e);
  }
  throw e;
};

@Injectable(FileAccessService, [])
export class FsFileAccessService implements FileAccessService {
  readonly priority = FS_PRIORITY;

  async getText(fullPath: DocumentUri): Promise<string> {
    return readFile(fullPath, 'utf-8').catch(handleFileErrorAndThrow(fullPath));
  }

  async updateFile(fullPath: string, textEdits: TextEdit[]): Promise<void> {
    const currentContent = await this.getText(fullPath);
    this.#validateNonOverlappingEdits(currentContent, textEdits);
    const updatedContent = this.#getUpdatedContent(currentContent, textEdits);

    const fileStat = await stat(fullPath).catch(handleFileErrorAndThrow(fullPath));
    await writeFile(fullPath, updatedContent, { mode: fileStat.mode });
  }

  async writeFile(fullPath: string, newContent: string): Promise<void> {
    await mkdir(dirname(fullPath), { recursive: true });
    await writeFile(fullPath, newContent);
  }

  /**
   * Apply an array of TextEdits to the current content of a file.
   */
  #getUpdatedContent(currentContent: string, textEdits: TextEdit[]): string {
    // Sort edits by position (reverse order)
    const sortedEdits = [...textEdits].sort((a, b) => {
      const aOffset = this.#positionToOffset(currentContent, a.range.start);
      const bOffset = this.#positionToOffset(currentContent, b.range.start);
      return bOffset - aOffset;
    });

    let result = currentContent;

    for (const edit of sortedEdits) {
      const startOffset = this.#positionToOffset(result, edit.range.start);
      const endOffset = this.#positionToOffset(result, edit.range.end);

      result = result.slice(0, startOffset) + edit.newText + result.slice(endOffset);
    }

    return result;
  }

  #validateNonOverlappingEdits(content: string, textEdits: TextEdit[]): void {
    if (textEdits.length <= 1) {
      return;
    }

    const offsetRanges = textEdits.map((edit) => {
      const start = this.#positionToOffset(content, edit.range.start);
      const end = this.#positionToOffset(content, edit.range.end);
      return { start, end, edit };
    });

    offsetRanges.sort((a, b) => a.start - b.start);

    for (let i = 0; i < offsetRanges.length - 1; i++) {
      const current = offsetRanges[i];
      const next = offsetRanges[i + 1];

      if (current.end > next.start) {
        throw new Error(
          `Overlapping text edits detected: edit at ${current.start}-${current.end} overlaps with edit at ${next.start}-${next.end}`,
        );
      }
    }
  }

  #positionToOffset(content: string, position: Position): number {
    const parts = content.split(/(\r\n|\r|\n)/);
    let offset = 0;
    let currentLine = 0;

    if (position.line < 0) {
      return Math.max(0, position.character);
    }

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isNewline = part === '\n' || part === '\r\n' || part === '\r';

      if (currentLine === position.line && !isNewline) {
        // We're at the target line, clamp character position to line length
        const clampedCharacter = Math.max(0, Math.min(position.character, part.length));
        return offset + clampedCharacter;
      }

      offset += part.length;

      if (isNewline) {
        currentLine++;
      }
    }

    // If we've reached the end and we're on the target line, handle it
    if (currentLine === position.line) {
      return offset + Math.max(0, position.character);
    }

    // Target line is beyond the content, return end of content
    return content.length;
  }

  async realPath(fullPath: string, checkedPaths: Set<string> = new Set()): Promise<string> {
    try {
      if (!checkedPaths.has(fullPath) && (await this.#isSymbolicLink(fullPath))) {
        checkedPaths.add(fullPath);
        const link = await readlink(fullPath);
        // `readlink` returns the raw target, which for a relative symlink is
        // relative to the LINK's own parent directory (POSIX semantics), not the
        // current working directory. Resolve it against the link's parent before
        // recursing so an in-workspace relative symlink (e.g. `-> ./realdir`)
        // resolves correctly. Resolving to an absolute path also lets
        // `checkedPaths` dedupe reliably, terminating relative symlink loops.
        const resolvedLink = isAbsolute(link) ? link : resolve(dirname(fullPath), link);
        return await this.realPath(resolvedLink, checkedPaths);
      }
      // NOTE: we do want to use realpathSync here
      // https://gitlab.com/gitlab-org/editor-extensions/security/gitlab-lsp/-/merge_requests/25#note_2580029775
      return realpathSync(fullPath);
    } catch (e) {
      const error = e as NodeJS.ErrnoException;
      if (error.code === 'ENOENT' || error.code === 'ENOTDIR') {
        return error.path ?? '';
      }

      // Avoid returning the unsanitized value if an unexpected exception occurred.
      return '';
    }
  }

  async #isSymbolicLink(fullPath: string): Promise<boolean> {
    try {
      const stats = await lstat(fullPath);
      return stats.isSymbolicLink();
    } catch {
      // File does not exist or it was not a symbolic link
      return false;
    }
  }
}
