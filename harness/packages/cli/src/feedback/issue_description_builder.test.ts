import { IssueDescriptionBuilder, type SystemInfo } from './issue_description_builder';

describe('IssueDescriptionBuilder', () => {
  const mockSystemInfo: SystemInfo = {
    cliVersion: '1.2.3',
    distribution: 'npm',
    osPlatform: 'darwin',
    osVersion: '23.0.0',
    terminalName: 'iTerm.app',
    shell: '/bin/zsh',
  };

  describe('when building a feature request description', () => {
    it('includes summary section with heading', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Add dark mode support',
        type: 'feature',
        systemInfo: mockSystemInfo,
      });

      expect(result).toContain('**Summary**');
      expect(result).toContain('Add dark mode support');
    });

    it('does not include system information section', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Add dark mode support',
        type: 'feature',
        systemInfo: mockSystemInfo,
      });

      expect(result).not.toContain('**System Information**');
      expect(result).not.toContain('CLI Version');
    });

    it('does not include logs section', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Add dark mode support',
        type: 'feature',
        systemInfo: mockSystemInfo,
        logContent: 'some logs',
      });

      expect(result).not.toContain('**Recent CLI Logs');
      expect(result).not.toContain('some logs');
    });

    it('includes quick action labels when provided', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Add dark mode support',
        type: 'feature',
        systemInfo: mockSystemInfo,
        labels: ['duo-cli', 'type::feature', 'feedback-form'],
      });

      expect(result).toContain('/label ~"duo-cli" ~"type::feature" ~"feedback-form"');
    });
  });

  describe('when building a bug report description', () => {
    it('includes description without summary heading', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Application crashes on startup',
        type: 'bug',
        systemInfo: mockSystemInfo,
      });

      expect(result).toContain('Application crashes on startup');
      expect(result).not.toContain('**Summary**');
    });

    it('includes system information section with all fields', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Application crashes on startup',
        type: 'bug',
        systemInfo: mockSystemInfo,
      });

      expect(result).toContain('**System Information**');
      expect(result).toContain('- CLI Version: 1.2.3');
      expect(result).toContain('- Distribution: npm');
      expect(result).toContain('- OS: darwin 23.0.0');
      expect(result).toContain('- Terminal: iTerm.app');
      expect(result).toContain('- Shell: /bin/zsh');
    });

    it('includes system information without shell when not provided', () => {
      const systemInfoWithoutShell: SystemInfo = {
        ...mockSystemInfo,
        shell: undefined,
      };

      const result = IssueDescriptionBuilder.build({
        description: 'Application crashes on startup',
        type: 'bug',
        systemInfo: systemInfoWithoutShell,
      });

      expect(result).toContain('**System Information**');
      expect(result).not.toContain('- Shell:');
    });

    it('includes actual logs in collapsible section when log content provided', () => {
      const logContent =
        '[2024-01-01 12:00:00] INFO: Starting application\n[2024-01-01 12:00:01] ERROR: Connection failed';

      const result = IssueDescriptionBuilder.build({
        description: 'Application crashes on startup',
        type: 'bug',
        systemInfo: mockSystemInfo,
        logContent,
      });

      expect(result).toContain('**Recent CLI Logs (last 200 lines)**');
      expect(result).toContain('<details>');
      expect(result).toContain('<summary>Click to expand logs</summary>');
      expect(result).toContain('```');
      expect(result).toContain(logContent);
      expect(result).toContain('</details>');
    });

    it('includes log placeholder when includeLogPlaceholder is true', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Application crashes on startup',
        type: 'bug',
        systemInfo: mockSystemInfo,
        includeLogPlaceholder: true,
      });

      expect(result).toContain('**Relevant logs and/or screenshots** (optional)');
      expect(result).toContain('<!-- Run `duo log list` to show recent CLI log files -->');
    });

    it('does not include logs section when neither logContent nor placeholder provided', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Application crashes on startup',
        type: 'bug',
        systemInfo: mockSystemInfo,
      });

      expect(result).not.toContain('**Recent CLI Logs');
      expect(result).not.toContain('**Relevant logs');
    });

    it('includes quick action labels when provided', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Application crashes on startup',
        type: 'bug',
        systemInfo: mockSystemInfo,
        labels: ['duo-cli', 'type::bug'],
      });

      expect(result).toContain('/label ~"duo-cli" ~"type::bug"');
    });

    it('separates sections with horizontal rules', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Application crashes on startup',
        type: 'bug',
        systemInfo: mockSystemInfo,
        logContent: 'some logs',
        labels: ['duo-cli'],
      });

      // Should have separators between: description, system info, logs, and labels
      const separatorCount = (result.match(/\n\n---\n\n/g) || []).length;
      expect(separatorCount).toBe(3);
    });
  });

  describe('edge cases', () => {
    it('handles empty description', () => {
      const result = IssueDescriptionBuilder.build({
        description: '',
        type: 'bug',
        systemInfo: mockSystemInfo,
      });

      expect(result).toBeDefined();
      expect(result).toContain('**System Information**');
    });

    it('handles very long logs', () => {
      const veryLongLogs = 'Log line\n'.repeat(1000);

      const result = IssueDescriptionBuilder.build({
        description: 'Test',
        type: 'bug',
        systemInfo: mockSystemInfo,
        logContent: veryLongLogs,
      });

      expect(result).toContain(veryLongLogs);
      expect(result).toContain('<details>');
    });

    it('handles empty labels array', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Test',
        type: 'bug',
        systemInfo: mockSystemInfo,
        labels: [],
      });

      expect(result).not.toContain('/label');
    });

    it('handles labels with special characters', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Test',
        type: 'bug',
        systemInfo: mockSystemInfo,
        labels: ['type::bug', 'priority::high', 'area::cli'],
      });

      expect(result).toContain('/label ~"type::bug" ~"priority::high" ~"area::cli"');
    });

    it('handles multiline descriptions', () => {
      const multilineDescription = 'First line\nSecond line\nThird line';

      const result = IssueDescriptionBuilder.build({
        description: multilineDescription,
        type: 'bug',
        systemInfo: mockSystemInfo,
      });

      expect(result).toContain(multilineDescription);
    });
  });

  describe('when logContent takes precedence over placeholder', () => {
    it('uses actual logs when both logContent and includeLogPlaceholder are provided', () => {
      const result = IssueDescriptionBuilder.build({
        description: 'Test',
        type: 'bug',
        systemInfo: mockSystemInfo,
        logContent: 'Actual log content',
        includeLogPlaceholder: true,
      });

      expect(result).toContain('Actual log content');
      expect(result).toContain('**Recent CLI Logs (last 200 lines)**');
      expect(result).not.toContain('**Relevant logs and/or screenshots**');
      expect(result).not.toContain('duo log list');
    });
  });
});
