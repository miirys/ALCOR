import { RunShellCommandFormatter } from './run_shell_command';

describe('RunShellCommandFormatter', () => {
  const formatter = new RunShellCommandFormatter();
  const command = 'echo "hello" && ls -la | grep test';

  it('exposes the shell_command tool name', () => {
    expect(formatter.toolName).toBe('shell_command');
  });

  it('returns the command in shell_command format', () => {
    const result = formatter.format({ command });

    expect(result).toEqual({
      tool: 'shell_command',
      command,
    });
  });

  it.each([
    ['command missing', {}],
    ['command a number', { command: 42 }],
  ])('throws on %s', (_label, args) => {
    expect(() => formatter.format(args)).toThrow();
  });
});
