import { describe, it, expect } from '@jest/globals';
import { getAgentModeConfig } from './agents';

describe('getAgentModeConfig', () => {
  describe('when mode is plan', () => {
    it('returns a plan mode config', () => {
      const config = getAgentModeConfig('plan');

      expect(config).toMatchObject({
        name: 'plan',
        excludeMcp: true,
      });
      expect(config?.systemPrompt).toContain('PLAN MODE');
    });

    it('does not include mutating tools', () => {
      const config = getAgentModeConfig('plan');
      const mutatingTools = ['create_file_with_contents', 'mkdir', 'edit_file', 'shell_command'];

      for (const tool of mutatingTools) {
        expect(config?.allowedTools).not.toContain(tool);
      }
    });
  });

  describe('when mode is build', () => {
    it('returns undefined', () => {
      expect(getAgentModeConfig('build')).toBeUndefined();
    });
  });

  describe('when mode is undefined', () => {
    it('returns undefined', () => {
      expect(getAgentModeConfig(undefined)).toBeUndefined();
    });
  });

  describe('when mode is an unknown string', () => {
    it('returns undefined', () => {
      expect(getAgentModeConfig('nonexistent')).toBeUndefined();
    });
  });
});
