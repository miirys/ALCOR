import { RunCommandFormatter } from './run_command';

describe('RunCommandFormatter', () => {
  const formatter = new RunCommandFormatter();

  it('exposes the run_command tool name', () => {
    expect(formatter.toolName).toBe('run_command');
  });

  describe('when args contains command field from run_shell_command', () => {
    it('returns the command directly', () => {
      const result = formatter.format({ command: 'tree -L 2 packages/tui' });

      expect(result).toEqual({
        tool: 'run_command',
        command: 'tree -L 2 packages/tui',
      });
    });
  });

  describe('when args contains program field from run_command', () => {
    it('returns program as the command', () => {
      const result = formatter.format({ program: 'npm' });

      expect(result).toEqual({
        tool: 'run_command',
        command: 'npm',
      });
    });

    it('combines program and args into command', () => {
      const result = formatter.format({ program: 'npm', args: 'run build' });

      expect(result).toEqual({
        tool: 'run_command',
        command: 'npm run build',
      });
    });
  });

  it.each([
    ['neither command nor program', {}],
    ['command a number', { command: 42 }],
    ['program a number', { program: 42 }],
    ['args a number', { program: 'npm', args: 42 }],
  ])('throws on %s', (_label, args) => {
    expect(() => formatter.format(args)).toThrow();
  });
});
