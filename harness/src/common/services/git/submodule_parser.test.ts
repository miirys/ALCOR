import { URI } from 'vscode-uri';
import { GitSubmodule } from '@gitlab-org/repositories';
import { parseGitModulesContent, isGitModulesFile } from './submodule_parser';

describe('SubmoduleParser', () => {
  let repositoryUri: URI;
  const isWindows = process.platform === 'win32';
  const workspaceFolderUri = URI.parse('file:///repo/root');

  beforeEach(() => {
    repositoryUri = URI.parse('file:///repo/root');
  });

  describe('isGitModulesFile', () => {
    it('should return true for a .gitmodules file path (unix style)', () => {
      const uri = URI.parse('file:///repo/root/.gitmodules');
      expect(isGitModulesFile(uri)).toBe(true);
    });

    it('should return true for a .gitmodules file path (windows style)', () => {
      if (isWindows) {
        const uri = URI.file('C:\\repo\\root\\.gitmodules');
        expect(isGitModulesFile(uri)).toBe(true);
      }
    });

    it('should return false for non-.gitmodules files', () => {
      const uri = URI.parse('file:///repo/root/somefile.txt');
      expect(isGitModulesFile(uri)).toBe(false);
    });

    it('should return false for paths containing .gitmodules in the middle', () => {
      const uri = URI.parse('file:///repo/root/.gitmodules/somefile');
      expect(isGitModulesFile(uri)).toBe(false);
    });
  });

  describe('parseGitModulesContent', () => {
    it('should parse a simple .gitmodules file with a single submodule', () => {
      const content = `[submodule "doc-site/themes/hugo-geekdoc"]
	path = doc-site/themes/hugo-geekdoc
	url = https://github.com/thegeeklab/hugo-geekdoc.git`;

      const expected: GitSubmodule[] = [
        {
          name: 'doc-site/themes/hugo-geekdoc',
          path: 'doc-site/themes/hugo-geekdoc',
          filePath: URI.parse('file:///repo/root/doc-site/themes/hugo-geekdoc'),
          url: 'https://github.com/thegeeklab/hugo-geekdoc.git',
          repositoryUri,
          workspaceFolderUri,
        },
      ];

      const result = parseGitModulesContent({ content, repositoryUri, workspaceFolderUri });
      expect(result).toEqual(expected);
    });

    it('should parse a .gitmodules file with multiple submodules', () => {
      const content = `[submodule "vendor/plugins/acts_as_list"]
	path = vendor/plugins/acts_as_list
	url = https://github.com/rails/acts_as_list.git
[submodule "vendor/plugins/attachment_fu"]
	path = vendor/plugins/attachment_fu
	url = https://github.com/technoweenie/attachment_fu.git
[submodule "vendor/plugins/exception_notification"]
	path = vendor/plugins/exception_notification
	url = https://github.com/rails/exception_notification.git`;

      const expected: GitSubmodule[] = [
        {
          name: 'vendor/plugins/acts_as_list',
          path: 'vendor/plugins/acts_as_list',
          filePath: URI.parse('file:///repo/root/vendor/plugins/acts_as_list'),
          url: 'https://github.com/rails/acts_as_list.git',
          repositoryUri,
          workspaceFolderUri,
        },
        {
          name: 'vendor/plugins/attachment_fu',
          path: 'vendor/plugins/attachment_fu',
          filePath: URI.parse('file:///repo/root/vendor/plugins/attachment_fu'),
          url: 'https://github.com/technoweenie/attachment_fu.git',
          repositoryUri,
          workspaceFolderUri,
        },
        {
          name: 'vendor/plugins/exception_notification',
          path: 'vendor/plugins/exception_notification',
          filePath: URI.parse('file:///repo/root/vendor/plugins/exception_notification'),
          url: 'https://github.com/rails/exception_notification.git',
          repositoryUri,
          workspaceFolderUri,
        },
      ];

      const result = parseGitModulesContent({ content, repositoryUri, workspaceFolderUri });
      expect(result).toEqual(expected);
    });

    it('should handle submodules with different formatting', () => {
      const content = `[submodule "lib/models"]
path = lib/models
url = git://example.com/models.git

[submodule "plugins/auth"]
        path = plugins/auth
        url = git://example.com/auth.git
`;

      const expected: GitSubmodule[] = [
        {
          name: 'lib/models',
          path: 'lib/models',
          filePath: URI.parse('file:///repo/root/lib/models'),
          url: 'git://example.com/models.git',
          repositoryUri,
          workspaceFolderUri,
        },
        {
          name: 'plugins/auth',
          path: 'plugins/auth',
          filePath: URI.parse('file:///repo/root/plugins/auth'),
          url: 'git://example.com/auth.git',
          repositoryUri,
          workspaceFolderUri,
        },
      ];

      const result = parseGitModulesContent({ content, repositoryUri, workspaceFolderUri });
      expect(result).toEqual(expected);
    });

    it('should handle submodules with additional properties', () => {
      const content = `[submodule "doc-site/themes/hugo-geekdoc"]
	path = doc-site/themes/hugo-geekdoc
	url = https://github.com/thegeeklab/hugo-geekdoc.git
	branch = main
	update = rebase`;

      const expected: GitSubmodule[] = [
        {
          name: 'doc-site/themes/hugo-geekdoc',
          path: 'doc-site/themes/hugo-geekdoc',
          filePath: URI.parse('file:///repo/root/doc-site/themes/hugo-geekdoc'),
          url: 'https://github.com/thegeeklab/hugo-geekdoc.git',
          repositoryUri,
          workspaceFolderUri,
          properties: {
            branch: 'main',
            update: 'rebase',
          },
        },
      ];

      const result = parseGitModulesContent({ content, repositoryUri, workspaceFolderUri });
      expect(result).toEqual(expected);
    });

    it('should handle empty content', () => {
      const content = '';
      const result = parseGitModulesContent({ content, repositoryUri, workspaceFolderUri });
      expect(result).toEqual([]);
    });

    it('should handle malformed content gracefully', () => {
      const content = `This is not a valid .gitmodules file
      [submodule no-quotes]
      no path or url`;

      const result = parseGitModulesContent({ content, repositoryUri, workspaceFolderUri });
      expect(result).toEqual([]);
    });

    it('should handle partial submodule information', () => {
      const content = `[submodule "partial"]
	path = partial/path
	# missing url`;

      // Should not include the partial submodule as it lacks a URL
      const result = parseGitModulesContent({ content, repositoryUri, workspaceFolderUri });
      expect(result).toEqual([]);
    });
  });

  it('should handle real-world complex examples', async () => {
    // A more complex example from a real project
    const fileContent = `[submodule "vendor/gems/omniauth"]
	path = vendor/gems/omniauth
	url = https://github.com/gitlabhq/omniauth.git
[submodule "vendor/gems/gollum"]
	path = vendor/gems/gollum
	url = https://github.com/gitlabhq/gollum.git
[submodule "vendor/gems/grit"]
	path = vendor/gems/grit
	url = https://github.com/gitlabhq/grit.git
[submodule "doc-site/themes/hugo-geekdoc"]
	path = doc-site/themes/hugo-geekdoc
	url = https://github.com/thegeeklab/hugo-geekdoc.git
	branch = main
`;

    const expected: GitSubmodule[] = [
      {
        name: 'vendor/gems/omniauth',
        path: 'vendor/gems/omniauth',
        filePath: URI.parse('file:///repo/root/vendor/gems/omniauth'),
        url: 'https://github.com/gitlabhq/omniauth.git',
        repositoryUri,
        workspaceFolderUri,
      },
      {
        name: 'vendor/gems/gollum',
        path: 'vendor/gems/gollum',
        filePath: URI.parse('file:///repo/root/vendor/gems/gollum'),
        url: 'https://github.com/gitlabhq/gollum.git',
        repositoryUri,
        workspaceFolderUri,
      },
      {
        name: 'vendor/gems/grit',
        path: 'vendor/gems/grit',
        filePath: URI.parse('file:///repo/root/vendor/gems/grit'),
        url: 'https://github.com/gitlabhq/grit.git',
        repositoryUri,
        workspaceFolderUri,
      },
      {
        name: 'doc-site/themes/hugo-geekdoc',
        path: 'doc-site/themes/hugo-geekdoc',
        filePath: URI.parse('file:///repo/root/doc-site/themes/hugo-geekdoc'),
        url: 'https://github.com/thegeeklab/hugo-geekdoc.git',
        repositoryUri,
        workspaceFolderUri,
        properties: {
          branch: 'main',
        },
      },
    ];

    const result = parseGitModulesContent({
      content: fileContent,
      repositoryUri,
      workspaceFolderUri,
    });

    expect(result).toEqual(expected);
  });

  it('should properly handle various additional properties', () => {
    const content = `[submodule "example"]
	path = path/to/example
	url = https://example.com/repo.git
	branch = develop
	update = checkout
	fetchRecurseSubmodules = true
	ignore = dirty
	shallow = true`;

    const expected: GitSubmodule[] = [
      {
        name: 'example',
        path: 'path/to/example',
        filePath: URI.parse('file:///repo/root/path/to/example'),
        url: 'https://example.com/repo.git',
        repositoryUri,
        workspaceFolderUri,
        properties: {
          branch: 'develop',
          update: 'checkout',
          fetchRecurseSubmodules: 'true',
          ignore: 'dirty',
          shallow: 'true',
        },
      },
    ];

    const result = parseGitModulesContent({ content, repositoryUri, workspaceFolderUri });
    expect(result).toEqual(expected);
  });
});
