import { defaultSlashCommands } from './slash_commands';

describe('GitLab Chat Slash Commands', () => {
  it('returns pre-defined set of slash commands', () => {
    expect(defaultSlashCommands).toEqual([
      expect.objectContaining({ name: '/new' }),
      expect.objectContaining({ name: '/tests' }),
      expect.objectContaining({ name: '/refactor' }),
      expect.objectContaining({ name: '/fix' }),
      expect.objectContaining({ name: '/explain' }),
      expect.objectContaining({ name: '/include' }),
      expect.objectContaining({ name: '/skills' }),
      expect.objectContaining({ name: '/help' }),
    ]);
  });
});
