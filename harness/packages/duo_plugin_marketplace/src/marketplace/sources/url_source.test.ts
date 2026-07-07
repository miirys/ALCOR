import { resolveUrlSource } from './url_source';

describe('resolveUrlSource', () => {
  describe('when the input is a non-existent local-looking path', () => {
    it('treats it as a url source', async () => {
      expect(await resolveUrlSource('/no/such/dir/xyz')).toEqual({
        source: 'url',
        url: '/no/such/dir/xyz',
      });
    });
  });

  describe('when the input is owner/repo shorthand', () => {
    it('resolves to a url source', async () => {
      expect(await resolveUrlSource('gitlab-org/duo-plugins')).toEqual({
        source: 'url',
        url: 'gitlab-org/duo-plugins',
      });
    });
  });

  describe('when the input is an https URL', () => {
    it('resolves to a url source', async () => {
      expect(await resolveUrlSource('https://gitlab.com/team/plugins.git')).toEqual({
        source: 'url',
        url: 'https://gitlab.com/team/plugins.git',
      });
    });
  });

  describe('when the input is an scp-like ssh URL', () => {
    it('resolves to a url source without mistaking user@host for a ref', async () => {
      expect(await resolveUrlSource('git@gitlab.com:team/plugins.git')).toEqual({
        source: 'url',
        url: 'git@gitlab.com:team/plugins.git',
      });
    });
  });

  describe('when the input is a file:// URL', () => {
    it('resolves to a url source', async () => {
      expect(await resolveUrlSource('file:///some/repo')).toEqual({
        source: 'url',
        url: 'file:///some/repo',
      });
    });
  });

  describe('when shorthand is pinned with @ref', () => {
    it('extracts the ref', async () => {
      expect(await resolveUrlSource('gitlab-org/duo-plugins@v2.0')).toEqual({
        source: 'url',
        url: 'gitlab-org/duo-plugins',
        ref: 'v2.0',
      });
    });
  });

  describe('when a git URL is pinned with #ref', () => {
    it('extracts the ref', async () => {
      expect(await resolveUrlSource('https://gitlab.com/team/plugins.git#main')).toEqual({
        source: 'url',
        url: 'https://gitlab.com/team/plugins.git',
        ref: 'main',
      });
    });
  });

  describe('when an scp-like URL is pinned with #ref', () => {
    it('extracts the ref without mistaking user@host for a ref', async () => {
      expect(await resolveUrlSource('git@gitlab.com:team/plugins.git#release')).toEqual({
        source: 'url',
        url: 'git@gitlab.com:team/plugins.git',
        ref: 'release',
      });
    });
  });
});
