import { getGitlabRealm, GitlabRealm } from './realm_detection';

describe('realm detection utilities', () => {
  describe('getGitlabRealm', () => {
    it.each([
      ['gitlab.com', 'https://gitlab.com', GitlabRealm.saas],
      ['gitlab.com with path', 'https://gitlab.com/api/v4', GitlabRealm.saas],
      ['gitlab.com with subdomain', 'https://company.gitlab.com', GitlabRealm.saas],
      ['self-managed', 'https://gitlab.example.com', GitlabRealm.selfManaged],
      ['self-managed with port', 'https://gitlab.company.internal:8080', GitlabRealm.selfManaged],
    ])('should detect %s correctly', (_, baseUrl, expected) => {
      expect(getGitlabRealm(baseUrl)).toBe(expected);
    });
  });
});
