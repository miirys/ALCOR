/**
 * Tests for marked-terminal — A custom renderer for marked to output to the Terminal
 *
 * Original author: Mikael Brevik (https://github.com/mikaelbr/marked-terminal)
 * Copyright (c) 2017 Mikael Brevik
 * Licensed under the MIT License — see LICENSE in this directory.
 *
 * Ported from the original mocha tests to Jest/TypeScript for marked v12.
 */

import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { marked } from 'marked';
import { resetHyperlinkCache } from '../../hyperlinks';
import Renderer, { markedTerminal } from './index';

/* eslint-disable @typescript-eslint/no-explicit-any, no-control-regex */

const identity = (o: string) => o;

/** Terminal env vars that affect hyperlink detection — cleared in test setup. */
const HYPERLINK_ENV_VARS = [
  'FORCE_HYPERLINK',
  'TMUX',
  'STY',
  'WT_SESSION',
  'TERM_PROGRAM',
  'KITTY_WINDOW_ID',
  'ALACRITTY_SOCKET',
  'TERM',
  'VTE_VERSION',
] as const;

/**
 * Save current env, then delete all hyperlink-related vars and reset the cache.
 * Returns a restore function that puts the original values back.
 */
function clearHyperlinkEnv(): () => void {
  const saved: Record<string, string | undefined> = {};
  for (const v of HYPERLINK_ENV_VARS) {
    saved[v] = process.env[v];
    delete process.env[v];
  }
  resetHyperlinkCache();
  return () => {
    for (const v of HYPERLINK_ENV_VARS) {
      if (saved[v] === undefined) delete process.env[v];
      else process.env[v] = saved[v];
    }
    resetHyperlinkCache();
  };
}

function stripTermEsc(str: string): string {
  return str.replace(/\u001b\[\d{1,2}m/g, '');
}

const STYLE_OPTS = [
  'code',
  'blockquote',
  'html',
  'heading',
  'firstHeading',
  'hr',
  'listitem',
  'table',
  'paragraph',
  'strong',
  'em',
  'codespan',
  'del',
  'link',
  'href',
] as const;

type IdentityOpts = Record<string, any>;

function makeIdentityOptions(): IdentityOpts {
  const o: IdentityOpts = {};
  for (const k of STYLE_OPTS) o[k] = identity;
  return o;
}

/** Reset marked to defaults before each test so `marked.use()` doesn't leak. */
function resetMarked(): void {
  marked.setOptions(marked.getDefaults());
}

/**
 * Synchronous wrapper — marked v12's `marked()` returns `string | Promise<string>`
 * in the type signature but is synchronous when no async extensions are registered.
 */
function render(src: string): string {
  return marked(src) as string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Direct Renderer class tests (internal API — textLength, etc.)
// ─────────────────────────────────────────────────────────────────────────────
describe('Terminal escape', () => {
  const r = new Renderer();

  it('should not be included in text length', () => {
    const tokens = [
      '\u001b[38;5;128mfoo\u001b[0m',
      '\u001b[33mfoo\u001b[22m\u001b[24m\u001b[39m',
      '\u001b[35m\u001b[4m\u001b[1mfoo',
      '\u001b[33mfo\u001b[39mo\u001b[0m',
    ];
    for (const token of tokens) {
      expect(r.textLength(token)).toBe(3);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markedTerminal() extension — rendering tests
// ─────────────────────────────────────────────────────────────────────────────
describe('markedTerminal rendering', () => {
  const defaultOpts = makeIdentityOptions();
  defaultOpts.tableOptions = { chars: { top: '@@@@TABLE@@@@@' } };
  let restoreEnv: () => void;

  beforeEach(() => {
    resetMarked();
    restoreEnv = clearHyperlinkEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('should render links', () => {
    marked.use(markedTerminal(defaultOpts) as any);
    expect(render('[Google](http://google.com)').trim()).toBe('Google (http://google.com)');
  });

  it('should pass on options to table', () => {
    marked.use(markedTerminal(defaultOpts) as any);
    const text =
      '| Lorem | Ipsum | Sit amet     | Dolar  |\n' +
      '|------|------|----------|----------|\n' +
      '| Row 1  | Value    | Value  | Value |\n' +
      '| Row 2  | Value    | Value  | Value |\n' +
      '| Row 3  | Value    | Value  | Value |\n' +
      '| Row 4  | Value    | Value  | Value |';
    expect(render(text).indexOf('@@@@TABLE@@@@@')).not.toBe(-1);
  });

  it('should not show link href twice if link and url is equal', () => {
    marked.use(markedTerminal(defaultOpts) as any);
    expect(render('http://google.com').trim()).toBe('http://google.com');
  });

  it('should render html as html', () => {
    marked.use(markedTerminal(defaultOpts) as any);
    expect(render('<strong>foo</strong>').trim()).toBe('<strong>foo</strong>');
  });

  it('should not escape entities', () => {
    marked.use(markedTerminal(defaultOpts) as any);
    const text =
      '# This < is "foo". it\'s a & string\n' +
      '> This < is "foo". it\'s a & string\n\n' +
      'This < is **"foo"**. it\'s a & string\n' +
      'This < is "foo". it\'s a & string';

    const expected =
      '# This < is "foo". it\'s a & string\n\n' +
      '    This < is "foo". it\'s a & string\n\n' +
      'This < is "foo". it\'s a & string\n' +
      'This < is "foo". it\'s a & string';
    expect(render(text).trim()).toBe(expected);
  });

  it('should not translate emojis inside codespans', () => {
    marked.use(markedTerminal(defaultOpts) as any);
    expect(render('Some `:+1:`').indexOf(':+1:')).not.toBe(-1);
  });

  it('should translate emojis', () => {
    marked.use(markedTerminal(defaultOpts) as any);
    expect(render('Some :+1:').indexOf(':+1')).toBe(-1);
  });

  it('should show default if not supported emojis', () => {
    marked.use(markedTerminal(defaultOpts) as any);
    expect(render('Some :someundefined:').indexOf(':someundefined:')).not.toBe(-1);
  });

  it('should not escape entities in tables', () => {
    marked.use(markedTerminal(defaultOpts) as any);
    const md = 'Usage | Syntax\r\n------|-------\r\nGeneral |`$ shell <CommandParam>`';
    expect(render(md).indexOf('<CommandParam>')).not.toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markedTerminal() extension — reflow tests
// ─────────────────────────────────────────────────────────────────────────────
describe('markedTerminal reflow', () => {
  const reflowOpts = makeIdentityOptions();
  reflowOpts.reflowText = true;
  reflowOpts.showSectionPrefix = false;
  reflowOpts.width = 10;

  function markup(str: string, gfm = false): string {
    marked.use(markedTerminal(reflowOpts) as any, { gfm } as any);
    return stripTermEsc(render(str));
  }

  beforeEach(() => {
    resetMarked();
  });

  it('should reflow paragraph and split words that are too long (one break)', () => {
    expect(markup('Now is the time: 01234567890\n')).toBe('Now is the\ntime: 0123\n4567890\n\n');
  });

  it('should reflow paragraph and split words that are too long (two breaks)', () => {
    expect(markup('Now is the time: http://timeanddate.com\n')).toBe(
      'Now is the\ntime: http\n://timeand\ndate.com\n\n',
    );
  });

  it('should reflow paragraph', () => {
    expect(markup('Now is the time\n')).toBe('Now is the\ntime\n\n');
  });

  it('should nuke section header', () => {
    expect(markup('# Contents\n')).toBe('Contents\n\n');
  });

  it('should reflow and nuke section header', () => {
    expect(markup('# Now is the time\n')).toBe('Now is the\ntime\n\n');
  });

  it('should preserve line breaks (gfm)', () => {
    expect(markup('Now  \nis    \nthe<br />time\n', true)).toBe('Now\nis\nthe\ntime\n\n');
  });

  it('should render ordered and unordered list with same newlines', () => {
    expect(markup('* ul item\n* ul item')).toBe('    * ul item\n    * ul item\n\n');
    expect(markup('1. ol item\n2. ol item')).toBe('    1. ol item\n    2. ol item\n\n');
  });

  it('should render nested lists', () => {
    const after = '\n\n';
    expect(markup('* ul item\n    * ul item')).toBe(`    * ul item\n        * ul item${after}`);
    expect(markup('1. ol item\n    1. ol item')).toBe(`    1. ol item\n        1. ol item${after}`);
    expect(markup('1. ol item\n    * ul item')).toBe(`    1. ol item\n        * ul item${after}`);
    expect(markup('* ul item\n    1. ol item')).toBe(`    * ul item\n        1. ol item${after}`);
  });

  it('should render task items', () => {
    expect(markup('* [ ] task item\n* [X] task item')).toBe(
      '    * [ ] task item\n    * [X] task item\n\n',
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// markedTerminal() extension — options tests
// ─────────────────────────────────────────────────────────────────────────────
describe('markedTerminal options', () => {
  beforeEach(() => {
    resetMarked();
  });

  it('should not translate emojis when disabled', () => {
    const opts = makeIdentityOptions();
    opts.emoji = false;
    marked.use(markedTerminal(opts) as any);
    expect(render('Some :emoji:').indexOf(':emoji:')).not.toBe(-1);
  });

  it('should change tabs by space size', () => {
    const opts = makeIdentityOptions();
    opts.emoji = false;
    opts.tab = 4;
    marked.use(markedTerminal(opts) as any);

    expect(render('> Blockquote')).toBe('    Blockquote\n\n');
    expect(render('* List Item')).toBe('    * List Item\n\n');
  });

  it('should use default tabs if passing not supported string', () => {
    const opts = makeIdentityOptions();
    opts.emoji = false;
    opts.tab = 'dsakdskajhdsa';
    marked.use(markedTerminal(opts) as any);

    expect(render('> Blockquote')).toBe('    Blockquote\n\n');
    expect(render('* List Item')).toBe('    * List Item\n\n');
  });

  it('should change tabs by allowed characters', () => {
    const opts = makeIdentityOptions();
    opts.emoji = false;
    opts.tab = '\t';
    marked.use(markedTerminal(opts) as any);

    expect(render('> Blockquote')).toBe('\tBlockquote\n\n');
    expect(render('* List Item')).toBe('\t* List Item\n\n');
  });

  it('should support multiple tab characters', () => {
    const opts = makeIdentityOptions();
    opts.emoji = false;
    opts.tab = '\t\t';
    marked.use(markedTerminal(opts) as any);

    expect(render('> Blockquote')).toBe('\t\tBlockquote\n\n');
    expect(render('* List Item')).toBe('\t\t* List Item\n\n');
  });

  it('should support overriding image handling', () => {
    const opts = makeIdentityOptions();
    opts.emoji = false;
    opts.image = () => 'IMAGE';
    marked.use(markedTerminal(opts) as any);

    expect(render('\n# Title\n![Alt text](./img.jpg)')).toBe('# Title\n\nIMAGE\n\n');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// e2e test
// ─────────────────────────────────────────────────────────────────────────────
// ─────────────────────────────────────────────────────────────────────────────
// OSC 8 hyperlink output tests
// ─────────────────────────────────────────────────────────────────────────────
describe('markedTerminal OSC 8 hyperlinks', () => {
  const defaultOpts = makeIdentityOptions();
  let restoreEnv: () => void;

  beforeEach(() => {
    resetMarked();
    restoreEnv = clearHyperlinkEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('should emit OSC 8 sequences when hyperlinks are supported', () => {
    process.env.FORCE_HYPERLINK = '1';
    marked.use(markedTerminal(defaultOpts) as any);
    const result = render('[Google](http://google.com)');
    // OSC 8 start: \x1b]8;;URL\x1b\\ ... OSC 8 end: \x1b]8;;\x1b\\
    expect(result).toContain('\x1b]8;;http://google.com\x1b\\');
    expect(result).toContain('Google');
    expect(result).toContain('\x1b]8;;\x1b\\');
  });

  it('should encode plus signs as %20 in href', () => {
    process.env.FORCE_HYPERLINK = '1';
    marked.use(markedTerminal(defaultOpts) as any);
    const result = render('[Link](http://example.com/a+b)');
    expect(result).toContain('http://example.com/a%20b');
  });

  it('should fall back to text (url) format when unsupported', () => {
    // No terminal env vars set → unsupported
    marked.use(markedTerminal(defaultOpts) as any);
    expect(render('[Google](http://google.com)').trim()).toBe('Google (http://google.com)');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// e2e test
// ─────────────────────────────────────────────────────────────────────────────
describe('markedTerminal e2e', () => {
  function getFixtureFile(fileName: string): string {
    // Both jest configs (root babel-jest CJS and TUI ts-jest ESM) resolve
    // paths differently. Use a path relative to the repo root via process.cwd()
    // won't work because CWD differs. Instead use a path based on this file's
    // known location in the repo.
    const fixturePath = resolve(
      process.cwd(),
      // Root config CWD = repo root; TUI config CWD = packages/tui
      // Detect which by checking if packages/ exists relative to cwd
      existsSync(resolve(process.cwd(), 'packages/tui'))
        ? 'packages/tui/src/lib/vendor/marked-terminal/tests/fixtures'
        : 'src/lib/vendor/marked-terminal/tests/fixtures',
      fileName,
    );
    return readFileSync(fixturePath, { encoding: 'utf8' });
  }
  let restoreEnv: () => void;

  beforeEach(() => {
    resetMarked();
    restoreEnv = clearHyperlinkEnv();
  });

  afterEach(() => {
    restoreEnv();
  });

  it('should render a full document of supported syntax', () => {
    const opts = makeIdentityOptions();
    marked.use(markedTerminal(opts) as any);
    const actual = stripTermEsc(render(getFixtureFile('e2e.md')));
    const expected = getFixtureFile('e2e.result.txt');
    expect(actual).toBe(expected);
  });
});
