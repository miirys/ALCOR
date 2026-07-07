interface TerminalWithWaitForMatch {
  waitForMatch(pattern: RegExp, timeout?: number): Promise<RegExpMatchArray>;
}

expect.extend({
  async toEventuallyMatchOutput(
    terminal: TerminalWithWaitForMatch,
    pattern: RegExp,
    timeout?: number,
  ) {
    try {
      await terminal.waitForMatch(pattern, timeout);
      return { pass: true, message: () => `expected terminal output not to match ${pattern}` };
    } catch (error: unknown) {
      const detail = error instanceof Error ? error.message : String(error);
      return {
        pass: false,
        message: () => `expected terminal output to match ${pattern}\n\n${detail}`,
      };
    }
  },
});
