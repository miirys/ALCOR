import { WorkspaceFolder } from 'vscode-languageserver';
import { fileNeedsExtension, getRelativePath, getFileExtensionByLanguageId } from './path';

describe('fileNeedsExtension', () => {
  it('should return true for file names with extensions', () => {
    expect(fileNeedsExtension('file.txt')).toBe(false);
    expect(fileNeedsExtension('document.pdf')).toBe(false);
    expect(fileNeedsExtension('image.jpg')).toBe(false);
    expect(fileNeedsExtension('.gitignore')).toBe(false);
  });

  it('should return false for file names without extensions', () => {
    expect(fileNeedsExtension('file')).toBe(true);
    expect(fileNeedsExtension('document')).toBe(true);
    expect(fileNeedsExtension('image')).toBe(true);
  });
});

describe('getRelativePath', () => {
  it('should return the file name when no workspace folder is provided', () => {
    const fileUri = 'file:///path/to/file.txt';
    expect(getRelativePath(fileUri)).toBe('file.txt');
  });

  it('should return the relative path when workspace folder is provided', () => {
    const fileUri = 'file:///workspace/project/src/file.txt';
    const workspaceFolder: WorkspaceFolder = {
      uri: 'file:///workspace/project',
      name: 'project',
    };
    expect(getRelativePath(fileUri, workspaceFolder)).toBe('src/file.txt');
  });

  it('should handle Windows-style paths', () => {
    const fileUri = 'file:///C:/workspace/project/src/file.txt';
    const workspaceFolder: WorkspaceFolder = {
      uri: 'file:///C:/workspace/project',
      name: 'project',
    };
    expect(getRelativePath(fileUri, workspaceFolder)).toBe('src/file.txt');
  });
});

describe('getFileExtensionByLanguageId', () => {
  it('should return the correct extension for a known language ID', () => {
    expect(getFileExtensionByLanguageId('typescript')).toBe('.ts');
    expect(getFileExtensionByLanguageId('javascriptreact')).toBe('.jsx');
  });

  it('should return an empty string for unknown language IDs', () => {
    expect(getFileExtensionByLanguageId('unknown')).toBe('');
  });
});
