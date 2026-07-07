import { createFakePartial } from '@gitlab-org/test-utils';
import { DefaultConfigService } from '@gitlab-org/config';
import { GitLabApiService, getLanguageServerVersion } from '@gitlab-org/core';
import { DefaultSystemContext } from './system_context';

describe('SystemContext', () => {
  it('returns ide and extension info', () => {
    const configService = new DefaultConfigService();
    configService.set('telemetry.ide', {
      vendor: 'JetBrains',
      name: 'Idea',
      version: '1.0.0',
    });
    configService.set('telemetry.extension', { name: 'GitLab JB', version: '2.0.0' });

    const apiClient = createFakePartial<GitLabApiService>({
      instanceInfo: {
        instanceUrl: new URL('https://gitlab.example.com'),
        instanceVersion: '17.6.2',
      },
    });

    const ctx = new DefaultSystemContext(configService, apiClient);

    expect(ctx.name).toBe('Systems');
    expect(ctx.children).toEqual([
      { name: 'IDE', value: 'JetBrains - Idea (1.0.0)' },
      { name: 'Extension', value: 'GitLab JB (2.0.0)' },
      { name: 'Language Server version', value: getLanguageServerVersion() },
      {
        name: 'GitLab Instance',
        value: 'https://gitlab.example.com/ (version: 17.6.2)',
      },
    ]);
  });
});
