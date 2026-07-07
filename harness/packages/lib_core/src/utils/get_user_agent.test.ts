import { getLanguageServerVersion } from '../get_language_server_version';
import { getUserAgent } from './get_user_agent';

describe('getUserAgent', () => {
  it('adds client info', () => {
    expect(getUserAgent({ name: 'test-name', version: '1.2.3' })).toBe(
      `gitlab-language-server:${getLanguageServerVersion()} (test-name:1.2.3)`,
    );
  });

  it('handles missing client info', () => {
    expect(getUserAgent(undefined)).toBe(
      `gitlab-language-server:${getLanguageServerVersion()} (missing client info)`,
    );
  });
});
