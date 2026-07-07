import { tryParseProjectPathFromWebUrl } from './utils';

describe('tryParseProjectPathFromWebUrl', () => {
  it('extracts project path from merge request URL', () => {
    const webUrl = 'https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/123';
    expect(tryParseProjectPathFromWebUrl(webUrl)).toBe('gitlab-org/gitlab-vscode-extension');
  });

  it('extracts project path from issue URL', () => {
    const webUrl = 'https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/456';
    expect(tryParseProjectPathFromWebUrl(webUrl)).toBe('gitlab-org/gitlab-vscode-extension');
  });

  it('handles nested project paths', () => {
    const webUrl =
      'https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/123';
    expect(tryParseProjectPathFromWebUrl(webUrl)).toBe('gitlab-org/editor-extensions/gitlab-lsp');
  });

  it('handles alternative hostnames', () => {
    const webUrl =
      'https://foo.example.com/gitlab-org/gitlab-vscode-extension/-/merge_requests/123';
    expect(tryParseProjectPathFromWebUrl(webUrl)).toBe('gitlab-org/gitlab-vscode-extension');
  });

  it('returns empty string for invalid URLs', () => {
    expect(tryParseProjectPathFromWebUrl('not a url')).toBe('');
  });

  it('returns empty string when pathPart not found', () => {
    const webUrl = 'https://gitlab.com/foo/bar/something-else';
    expect(tryParseProjectPathFromWebUrl(webUrl)).toBe('');
  });
});
