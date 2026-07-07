import { describe, it, expect } from '@jest/globals';
import { render } from 'ink-testing-library';
import { DeprecationBanner } from './DeprecationBanner';

describe('DeprecationBanner', () => {
  it('wraps its content within the terminal width on narrow terminals', () => {
    const output =
      render(<DeprecationBanner status="use-glab-duo-cli" columns={40} />).lastFrame() ?? '';

    expect(output).toContain('NPM release deprecation notice');
    const widest = Math.max(...output.split('\n').map((line) => line.length));
    expect(widest).toBeLessThanOrEqual(40);
  });

  // 'glab-missing' is excluded: it renders a long, unbreakable docs URL that
  // cannot word-wrap, so it can exceed the width regardless of box constraints.
  it('does not exceed the terminal width for text statuses', () => {
    const statuses = ['use-glab-duo-cli', 'update-glab'] as const;
    for (const status of statuses) {
      for (const columns of [40, 80, 120]) {
        const output =
          render(<DeprecationBanner status={status} columns={columns} />).lastFrame() ?? '';
        const widest = Math.max(...output.split('\n').map((line) => line.length));
        expect(widest).toBeLessThanOrEqual(columns);
      }
    }
  });
});
