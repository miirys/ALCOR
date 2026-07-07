import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import { render } from 'ink-testing-library';
import stripAnsi from 'strip-ansi';
import chalk from 'chalk';
import { Markdown, processContent, TABLE_CELL_SPLIT } from './Markdown';

// Render the Markdown component and return the raw (ANSI-coloured) frame plus a
// stripped view. Using a helper keeps the tests compact and immune to missing frames.
function renderMd(markdown: string, opts: { availableWidth?: number } = {}) {
  const { lastFrame } = render(<Markdown markdown={markdown} {...opts} />);
  const raw = lastFrame() ?? '';
  return { raw, plain: stripAnsi(raw) as string };
}

describe('Markdown', () => {
  // chalk is a process-wide singleton; save and restore its level so this suite
  // does not leak ANSI-forcing state into other test files in the same worker.
  let previousChalkLevel: typeof chalk.level;
  beforeAll(() => {
    previousChalkLevel = chalk.level;
    // Ensure chalk produces ANSI codes in tests so we can assert on styling
    chalk.level = 1;
  });
  afterAll(() => {
    chalk.level = previousChalkLevel;
  });

  describe('component rendering', () => {
    it('should render basic text', () => {
      const { lastFrame } = render(<Markdown markdown="Hello world" />);
      const output = lastFrame();

      expect(output).toContain('Hello world');
    });

    it('should render with a prefix on the first line', () => {
      const { lastFrame } = render(<Markdown markdown="Hello" prefix="> " />);
      const output = stripAnsi(lastFrame() ?? '') as string;
      const lines = output.split('\n').filter((l) => l.trim());

      expect(lines[0]).toMatch(/^> /);
    });
  });

  describe('numbered list rendering', () => {
    it('numbers simple top-level items sequentially from 1', () => {
      const { plain } = renderMd('1. first\n2. second\n3. third');

      expect(plain).toContain('1. first');
      expect(plain).toContain('2. second');
      expect(plain).toContain('3. third');
    });

    // marked-terminal bug: `numberedLines()` matches every `* ` marker in the
    // pre-rendered body, including indented sub-bullets that were already rendered
    // by an inner `list()` call. This causes sub-bullets to consume numbers from
    // the parent ordered list. For example, with the input below vanilla
    // marked-terminal produces:
    //
    //   1. Set up your environment
    //     * Install Node.js 18+
    //     2. Configure your .env file   ← sub-bullet wrongly numbered
    //   3. Run the test suite            ← should be 2
    //
    // Our `list()` override fixes this by only renumbering lines matching `^\* `
    // (no leading whitespace), so indented sub-bullets are left untouched.
    it('does not number sub-bullets as top-level items', () => {
      const { plain } = renderMd(
        [
          '1. Set up your environment',
          '   - Install Node.js 18+',
          '   - Configure your .env file',
          '2. Run the test suite',
        ].join('\n'),
      );

      expect(plain).toContain('1. Set up your environment');
      expect(plain).toContain('2. Run the test suite');

      // Sub-bullets stay as bullets, not renumbered
      expect(plain).toContain('* Install Node.js 18+');
      expect(plain).toContain('* Configure your .env file');

      // Only 2 top-level items — numbering must not reach 3+
      expect(plain).not.toMatch(/^\s*[3-9]\.\s/m);
    });

    it('has no blank lines between consecutive sub-bullets', () => {
      const { plain } = renderMd(
        [
          '1. Set up your environment',
          '   - Install Node.js 18+',
          '   - Configure your .env file',
          '2. Run the test suite',
          '   - Unit tests: npm test',
          '   - Integration tests: npm run test:integration',
        ].join('\n'),
      );

      const lines = plain.split('\n');
      // Find the sub-bullet lines and assert no blank line sits between
      // consecutive sub-bullets of the same parent item.
      for (let i = 0; i < lines.length - 1; i++) {
        const cur = lines[i].trim();
        const next = lines[i + 1]?.trim();
        if (cur.startsWith('*') && next === '' && lines[i + 2]?.trim().startsWith('*')) {
          throw new Error(
            `Blank line between sub-bullets at lines ${i} and ${i + 2}:\n${lines
              .slice(i, i + 3)
              .join('\n')}`,
          );
        }
      }
    });

    // marked-terminal bug: `numberedLines()` hardcodes `let num = 0` and the
    // `Renderer.prototype.list` method reads `start` from the token but never
    // passes it through to the numbering logic. So `3. Third\n4. Fourth` is
    // rendered as `1. Third\n2. Fourth`. Our `list()` override reads `start`
    // and begins numbering from the correct value.
    it('respects an explicit start value greater than 1', () => {
      const { plain } = renderMd('3. Third\n4. Fourth\n5. Fifth');

      expect(plain).toContain('3. Third');
      expect(plain).toContain('4. Fourth');
      expect(plain).toContain('5. Fifth');
      expect(plain).not.toMatch(/^\s*1\.\s/m);
    });

    it('handles multi-digit start values', () => {
      const { plain } = renderMd('42. answer\n43. follow-up');

      expect(plain).toContain('42. answer');
      expect(plain).toContain('43. follow-up');
    });

    it('does not renumber nested ordered lists against the outer counter', () => {
      const { plain } = renderMd(
        ['1. outer-one', '   1. inner-one', '   2. inner-two', '2. outer-two'].join('\n'),
      );

      expect(plain).toContain('1. outer-one');
      expect(plain).toContain('2. outer-two');
      expect(plain).toMatch(/1\.\s+inner-one/);
      expect(plain).toMatch(/2\.\s+inner-two/);
    });

    it('leaves unordered lists as bullets', () => {
      const { plain } = renderMd('- alpha\n- beta\n- gamma');

      expect(plain).toMatch(/\*\s+alpha/);
      expect(plain).toMatch(/\*\s+beta/);
      expect(plain).toMatch(/\*\s+gamma/);
      // No accidental numbering applied to an unordered list.
      expect(plain).not.toMatch(/^\s*\d+\.\s/m);
    });

    it('renders an unordered list nested inside an unordered list', () => {
      const { plain } = renderMd(
        ['- outer-a', '  - inner-a', '  - inner-b', '- outer-b'].join('\n'),
      );

      expect(plain).toContain('outer-a');
      expect(plain).toContain('outer-b');
      expect(plain).toContain('inner-a');
      expect(plain).toContain('inner-b');
      // Inner bullets must be indented relative to outer bullets.
      const lines = plain.split('\n');
      const outerIndent = lines.find((l) => l.includes('outer-a'))?.match(/^\s*/)?.[0].length ?? 0;
      const innerIndent = lines.find((l) => l.includes('inner-a'))?.match(/^\s*/)?.[0].length ?? 0;
      expect(innerIndent).toBeGreaterThan(outerIndent);
    });

    it('renumbers a second ordered list separately from the first', () => {
      const { plain } = renderMd(
        [
          '1. first-list-one',
          '2. first-list-two',
          '',
          'Paragraph.',
          '',
          '1. second-list-one',
          '2. second-list-two',
        ].join('\n'),
      );

      expect(plain).toContain('1. first-list-one');
      expect(plain).toContain('2. first-list-two');
      expect(plain).toContain('1. second-list-one');
      expect(plain).toContain('2. second-list-two');
    });
  });

  describe('header hierarchy rendering', () => {
    // SGR escape sequences we want to detect in the raw ANSI output.
    const BOLD_ON = '\u001B[1m';
    const UNDERLINE_ON = '\u001B[4m';

    it('renders h1 with bold + underline and preserves the # prefix', () => {
      const { raw, plain } = renderMd('# Heading One');

      expect(raw).toContain(BOLD_ON);
      expect(raw).toContain(UNDERLINE_ON);
      expect(plain).toContain('# Heading One');
    });

    it('renders h2 with bold but not underline', () => {
      const { raw, plain } = renderMd('## Heading Two');

      expect(raw).toContain(BOLD_ON);
      expect(raw).not.toContain(UNDERLINE_ON);
      expect(plain).toContain('## Heading Two');
    });

    it.each([
      ['h3', '### Heading Three'],
      ['h4', '#### Heading Four'],
      ['h5', '##### Heading Five'],
      ['h6', '###### Heading Six'],
    ])('renders %s without bold or underline', (_label, markdown) => {
      const { raw, plain } = renderMd(markdown);

      expect(raw).not.toContain(BOLD_ON);
      expect(raw).not.toContain(UNDERLINE_ON);
      // The # section prefix should survive at the expected level.
      const hashes = markdown.match(/^#+/)?.[0] ?? '';
      expect(plain).toContain(`${hashes} `);
    });

    it('produces visually distinct ANSI output for every adjacent level pair', () => {
      const frames = [1, 2, 3].map((lvl) => renderMd(`${'#'.repeat(lvl)} Title`).raw);
      expect(frames[0]).not.toEqual(frames[1]); // h1 vs h2
      expect(frames[1]).not.toEqual(frames[2]); // h2 vs h3
    });

    it('renders inline markdown inside a heading', () => {
      const { plain } = renderMd('## Heading with **bold** and `code`');

      expect(plain).toContain('bold');
      expect(plain).toContain('code');
      // The literal markdown delimiters should not leak through as plain text.
      expect(plain).not.toMatch(/\*\*bold\*\*/);
    });
  });

  describe('processContent', () => {
    it('should apply prefix to the first visible line and indent subsequent lines', () => {
      const result = processContent('line one\nline two', 80, '> ');
      const lines = result.split('\n').filter((l) => l.trim());

      expect(lines[0]).toMatch(/^> /);
      expect(lines[1]).toMatch(/^ {2}/);
    });

    it('should collapse consecutive blank lines', () => {
      const result = processContent('a\n\n\n\nb', 80);

      expect(result).not.toContain('\n\n\n');
    });

    it('should respect maxLines by truncating from the top', () => {
      const input = Array.from({ length: 20 }, (_, i) => `line ${i + 1}`).join('\n');
      const result = processContent(input, 80, undefined, 5);
      const lines = result.split('\n');

      expect(lines.length).toBeLessThanOrEqual(5);
      expect(result).toContain('line 20');
    });

    it('should wrap long lines at the specified column width', () => {
      const longLine = 'word '.repeat(30).trim();
      const cols = 40;
      const result = processContent(longLine, cols);
      const lines = result.split('\n');

      for (const line of lines) {
        const visible = (stripAnsi(line) as string).trimEnd();
        expect(visible.length).toBeLessThanOrEqual(cols);
      }
    });
  });

  describe('edge cases', () => {
    it('renders the empty string without throwing or producing ANSI garbage', () => {
      const { raw, plain } = renderMd('');
      expect(plain.trim()).toBe('');
      // Only whitespace/ANSI — no stray content.
      expect(raw).not.toMatch(/[A-Za-z0-9]/);
    });

    it('renders a heading immediately followed by a numbered list', () => {
      const { plain } = renderMd(['## Steps', '', '1. one', '2. two'].join('\n'));
      expect(plain).toContain('## Steps');
      expect(plain).toContain('1. one');
      expect(plain).toContain('2. two');
    });

    it('preserves fenced code block content verbatim (no numbering injected)', () => {
      const { plain } = renderMd(['```', '1. not a list item', 'line two', '```'].join('\n'));
      expect(plain).toContain('1. not a list item');
      expect(plain).toContain('line two');
    });

    it('code blocks are not indented beyond their own content', () => {
      const { plain } = renderMd(
        ['```yaml', 'stages:', '  - build', '  - deploy', '```'].join('\n'),
      );

      const lines = plain.split('\n').filter((l) => l.trim());
      const stageLine = lines.find((l) => l.includes('stages:'));
      expect(stageLine).toBeDefined();
      // Code block content should start at column 0 (no extra indent)
      const indent = stageLine?.match(/^(\s*)/)?.[1].length ?? 0;
      expect(indent).toBe(0);
    });

    it('code blocks between list items stay at root indent level', () => {
      const { plain } = renderMd(
        [
          '1. Create the config file:',
          '',
          '```yaml',
          'stages:',
          '  - build',
          '```',
          '',
          '2. Add the build job:',
        ].join('\n'),
      );

      // Code block should not be indented to the list level
      const stageLine = plain.split('\n').find((l) => l.includes('stages:'));
      expect(stageLine).toBeDefined();
      const stageIndent = stageLine?.match(/^(\s*)/)?.[1].length ?? 0;
      expect(stageIndent).toBe(0);

      // List items should still render correctly
      expect(plain).toContain('1. Create the config file:');
      expect(plain).toContain('2. Add the build job:');
    });
  });

  describe('fixture snapshot', () => {
    const fixtureDir = path.join(path.dirname(new URL(import.meta.url).pathname), '__fixtures__');

    it('renders example.md matching the rendered.txt fixture', () => {
      const markdown = fs.readFileSync(path.join(fixtureDir, 'example.md'), 'utf-8');
      const { plain } = renderMd(markdown);

      // To regenerate: fs.writeFileSync(path.join(fixtureDir, 'rendered.txt'), plain);
      const expected = fs.readFileSync(path.join(fixtureDir, 'rendered.txt'), 'utf-8');
      expect(plain).toBe(expected);
    });
  });

  describe('TABLE_CELL_SPLIT', () => {
    it('should match the delimiter used by the vendored marked-terminal', () => {
      const thisDir = path.dirname(new URL(import.meta.url).pathname);
      const vendorIndex = path.resolve(thisDir, '../vendor/marked-terminal/index.ts');
      const source = fs.readFileSync(vendorIndex, 'utf-8');

      expect(source).toContain(`TABLE_CELL_SPLIT = '${TABLE_CELL_SPLIT}'`);
    });
  });
});
