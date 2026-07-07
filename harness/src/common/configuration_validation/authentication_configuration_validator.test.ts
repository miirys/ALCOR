import { createFakePartial } from '@gitlab-org/test-utils';
import { AUTHENTICATION, AUTHENTICATION_REQUIRED, INVALID_TOKEN } from '@gitlab-org/core';
import { GitLabAPI } from '../api';
import { DefaultAuthenticationConfigurationValidator } from './authentication_configuration_validator';

describe('AuthenticationConfigurationValidator', () => {
  const baseUrl = 'https://gitlab.com';
  const token = 'glpat-1234566';

  const mockCheckToken = jest.fn();
  const api = createFakePartial<GitLabAPI>({
    checkToken: mockCheckToken,
  });

  const validator = new DefaultAuthenticationConfigurationValidator(api);

  it('should engage AUTHENTICATION_REQUIRED check when baseUrl is missing', async () => {
    const result = await validator.validate({ baseUrl: '', token });

    expect(result?.featureId).toEqual(AUTHENTICATION);
    expect(result?.engagedChecks).toHaveLength(1);
    expect(result?.engagedChecks[0]).toEqual({
      checkId: AUTHENTICATION_REQUIRED,
      details: 'You need to authenticate to use GitLab Duo.',
      engaged: true,
    });
    expect(result?.allChecks).toHaveLength(2);
    expect(result?.allChecks[0]).toEqual({
      checkId: AUTHENTICATION_REQUIRED,
      details: 'You need to authenticate to use GitLab Duo.',
      engaged: true,
    });
    expect(result?.allChecks[1]).toEqual({
      checkId: INVALID_TOKEN,
      details: 'The provided token is invalid or expired.',
      engaged: false,
    });
  });

  it('should engage AUTHENTICATION_REQUIRED check when token is missing', async () => {
    const result = await validator.validate({ baseUrl, token: '' });

    expect(result?.featureId).toEqual(AUTHENTICATION);
    expect(result?.engagedChecks).toHaveLength(1);
    expect(result?.engagedChecks[0]).toEqual({
      checkId: AUTHENTICATION_REQUIRED,
      details: 'You need to authenticate to use GitLab Duo.',
      engaged: true,
    });
    expect(result?.allChecks).toHaveLength(2);
    expect(result?.allChecks[0]).toEqual({
      checkId: AUTHENTICATION_REQUIRED,
      details: 'You need to authenticate to use GitLab Duo.',
      engaged: true,
    });
    expect(result?.allChecks[1]).toEqual({
      checkId: INVALID_TOKEN,
      details: 'The provided token is invalid or expired.',
      engaged: false,
    });
  });

  it('should engage INVALID_TOKEN check when token is invalid', async () => {
    mockCheckToken.mockResolvedValue({ valid: false });

    const result = await validator.validate({ baseUrl, token });

    expect(result?.featureId).toEqual(AUTHENTICATION);
    expect(result?.engagedChecks).toHaveLength(1);
    expect(result?.engagedChecks[0]).toEqual({
      checkId: INVALID_TOKEN,
      details: 'The provided token is invalid or expired.',
      engaged: true,
    });
    expect(result?.allChecks).toHaveLength(2);
    expect(result?.allChecks[0]).toEqual({
      checkId: AUTHENTICATION_REQUIRED,
      details: 'You need to authenticate to use GitLab Duo.',
      engaged: false,
    });
    expect(result?.allChecks[1]).toEqual({
      checkId: INVALID_TOKEN,
      details: 'The provided token is invalid or expired.',
      engaged: true,
    });
  });

  it('should have no engaged check when token is valid', async () => {
    mockCheckToken.mockResolvedValue({ valid: true });

    const result = await validator.validate({ baseUrl, token });

    expect(result?.featureId).toEqual(AUTHENTICATION);
    expect(result?.engagedChecks).toHaveLength(0);
    expect(result?.allChecks).toHaveLength(2);
    expect(result?.allChecks[0]).toEqual({
      checkId: AUTHENTICATION_REQUIRED,
      details: 'You need to authenticate to use GitLab Duo.',
      engaged: false,
    });
    expect(result?.allChecks[1]).toEqual({
      checkId: INVALID_TOKEN,
      details: 'The provided token is invalid or expired.',
      engaged: false,
    });
  });
});
