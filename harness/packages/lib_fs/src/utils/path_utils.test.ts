import {
  fileLookupKey,
  isFileSchemeUri,
  isVirtualWorkspaceUri,
  workspaceFolderPathFromUri,
} from './path_utils';

describe('isFileSchemeUri', () => {
  describe('when the URI uses the file:// scheme', () => {
    it('returns true for a standard file URI', () => {
      expect(isFileSchemeUri('file:///home/user/project')).toBe(true);
    });

    it('returns true for a Windows-style file URI', () => {
      expect(isFileSchemeUri('file:///C:/Users/user/project')).toBe(true);
    });
  });

  describe('when the URI uses a virtual filesystem scheme', () => {
    it('returns false for adt:// URIs', () => {
      expect(isFileSchemeUri('adt://server/sap/bc/adt/packages/zmy_package')).toBe(false);
    });

    it('returns false for semanticfs:// URIs', () => {
      expect(isFileSchemeUri('semanticfs://host/path/to/workspace')).toBe(false);
    });

    it('returns false for any non-file scheme', () => {
      expect(isFileSchemeUri('vscode-remote://ssh-remote+host/home/user/project')).toBe(false);
    });
  });
});

describe('workspaceFolderPathFromUri', () => {
  describe('when the URI uses the file:// scheme', () => {
    it('returns the OS-native filesystem path', () => {
      expect(workspaceFolderPathFromUri('file:///home/user/project')).toBe('/home/user/project');
    });

    it('handles URL-encoded characters in the path', () => {
      expect(workspaceFolderPathFromUri('file:///home/user/my%20project')).toBe(
        '/home/user/my project',
      );
    });
  });

  describe('when the URI uses a virtual filesystem scheme', () => {
    it('returns the URI path component for adt:// URIs', () => {
      expect(workspaceFolderPathFromUri('adt://server/sap/bc/adt/packages/zmy_package')).toBe(
        '/sap/bc/adt/packages/zmy_package',
      );
    });

    it('returns the URI path component for semanticfs:// URIs', () => {
      expect(workspaceFolderPathFromUri('semanticfs://host/path/to/workspace')).toBe(
        '/path/to/workspace',
      );
    });

    it('returns / when the URI has no path component', () => {
      expect(workspaceFolderPathFromUri('adt://server')).toBe('/');
    });
  });
});

describe('isVirtualWorkspaceUri', () => {
  it('returns false for undefined', () => {
    expect(isVirtualWorkspaceUri(undefined)).toBe(false);
  });

  it('returns false for file:// URIs', () => {
    expect(isVirtualWorkspaceUri('file:///home/user/project')).toBe(false);
  });

  it('returns true for virtual schemes with authority', () => {
    expect(isVirtualWorkspaceUri('adt://server/sap/path')).toBe(true);
  });

  it('returns true for virtual schemes without authority', () => {
    expect(isVirtualWorkspaceUri('testfs:/demo')).toBe(true);
  });
});

describe('fileLookupKey', () => {
  it('joins workspaceFolderPath with filePath when no URI given', () => {
    expect(fileLookupKey('/home/user/project', undefined, 'src/file.ts')).toBe(
      '/home/user/project/src/file.ts',
    );
  });

  it('joins workspaceFolderPath when workspace is file://', () => {
    expect(fileLookupKey('/home/user/project', 'file:///home/user/project', 'src/file.ts')).toBe(
      '/home/user/project/src/file.ts',
    );
  });

  it('joins on the URI for virtual workspaces with authority', () => {
    expect(fileLookupKey('/sap/path', 'adt://server/sap/path', 'src/math.abap')).toBe(
      'adt://server/sap/path/src/math.abap',
    );
  });

  it('joins on the URI for virtual workspaces without authority', () => {
    expect(fileLookupKey('/demo', 'testfs:/demo', 'src/math.ts')).toBe('testfs:/demo/src/math.ts');
  });

  it('URL-encodes path segments to match VS Code didOpen URI keys', () => {
    expect(fileLookupKey('/demo', 'testfs:/demo', 'my project/x.ts')).toBe(
      'testfs:/demo/my%20project/x.ts',
    );
  });
});
