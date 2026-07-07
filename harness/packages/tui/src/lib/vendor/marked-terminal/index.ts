/**
 * marked-terminal — A custom renderer for marked to output to the Terminal
 *
 * Original author: Mikael Brevik (https://github.com/mikaelbr/marked-terminal)
 * Copyright (c) 2017 Mikael Brevik
 * Licensed under the MIT License — see LICENSE in this directory.
 *
 * This file is a TypeScript port of marked-terminal v7.3.0, vendored into this
 * project so we can patch behaviour and avoid an external runtime dependency.
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-non-null-assertion, @typescript-eslint/no-unused-vars, no-param-reassign, no-continue, no-control-regex, no-restricted-globals, no-script-url, import/no-default-export */
import chalk from 'chalk';
import Table from 'cli-table3';
import { highlight as highlightCli } from 'cli-highlight';
import * as emoji from 'node-emoji';
import ansiRegex from 'ansi-regex';
import stripAnsi from 'strip-ansi';
import { supportsHyperlinks, hyperlink as makeHyperlink } from '../../hyperlinks';

const TABLE_CELL_SPLIT = '^*||*^';
const TABLE_ROW_WRAP = '*|*|*|*';
const TABLE_ROW_WRAP_REGEXP = new RegExp(escapeRegExp(TABLE_ROW_WRAP), 'g');

const COLON_REPLACER = '*#COLON|*';
const COLON_REPLACER_REGEXP = new RegExp(escapeRegExp(COLON_REPLACER), 'g');

const TAB_ALLOWED_CHARACTERS = ['\t'];

const ANSI_REGEXP = ansiRegex();

// HARD_RETURN holds a character sequence used to indicate text has a
// hard (no-reflowing) line break.  Previously \r and \r\n were turned
// into \n in marked's lexer- preprocessing step. So \r is safe to use
// to indicate a hard (non-reflowed) return.
const HARD_RETURN = '\r';
const HARD_RETURN_RE = new RegExp(HARD_RETURN);
const HARD_RETURN_GFM_RE = new RegExp(`${HARD_RETURN}|<br />`);

type StyleFn = (s: string) => string;

interface RendererOptions {
  code: StyleFn;
  blockquote: StyleFn;
  html: StyleFn;
  heading: StyleFn;
  firstHeading: StyleFn;
  hr: StyleFn;
  listitem: StyleFn;
  list: (body: string, ordered: boolean, indent: string) => string;
  table: StyleFn;
  paragraph: StyleFn;
  strong: StyleFn;
  em: StyleFn;
  codespan: StyleFn;
  del: StyleFn;
  link: StyleFn;
  href: StyleFn;
  text: StyleFn;
  unescape: boolean;
  emoji: boolean;
  width: number;
  showSectionPrefix: boolean;
  reflowText: boolean;
  tab: number | string;
  tableOptions: any;
  image?: (href: string, title: string, text: string) => string;
  /** Per-level heading stylers. When set, takes precedence over firstHeading/heading. */
  headingStyles?: Record<number, StyleFn>;
}

const defaultOptions: RendererOptions = {
  code: chalk.yellow,
  blockquote: chalk.gray.italic,
  html: chalk.gray,
  heading: chalk.green.bold,
  firstHeading: chalk.magenta.underline.bold,
  hr: chalk.reset,
  listitem: chalk.reset,
  list: listFn,
  table: chalk.reset,
  paragraph: chalk.reset,
  strong: chalk.bold,
  em: chalk.italic,
  codespan: chalk.yellow,
  del: chalk.dim.gray.strikethrough,
  link: chalk.blue,
  href: chalk.blue.underline,
  text: identity,
  unescape: true,
  emoji: true,
  width: 80,
  showSectionPrefix: true,
  reflowText: false,
  tab: 4,
  tableOptions: {},
};

// Heading stylers keyed by level. All levels use cyan; h1 adds bold + underline,
// h2 adds bold, h3+ uses cyan alone.
const HEADING_STYLERS: Record<number | 'default', (s: string) => string> = {
  1: chalk.cyan.bold.underline,
  2: chalk.cyan.bold,
  default: chalk.cyan,
};

// Compute length of str not including ANSI escape codes.
// See http://en.wikipedia.org/wiki/ANSI_escape_code#graphics
function textLength(str: string): number {
  return str.replace(ANSI_REGEXP, '').length;
}

function fixHardReturn(text: string, reflow: boolean): string {
  return reflow ? text.replace(HARD_RETURN, /\n/g as any) : text;
}

function section(text: string): string {
  return `${text}\n\n`;
}

function highlightCode(
  code: string,
  language: string | undefined,
  opts: RendererOptions,
  highlightOpts: any,
): string {
  if (chalk.level === 0) return code;

  const style = opts.code;
  const fixed = fixHardReturn(code, opts.reflowText);

  try {
    return highlightCli(fixed, { language, ...highlightOpts });
  } catch (_e) {
    return style(fixed);
  }
}

function insertEmojis(text: string): string {
  return text.replace(/:([A-Za-z0-9_\-+]+?):/g, (emojiString) => {
    const emojiSign = emoji.get(emojiString);
    if (!emojiSign) return emojiString;
    return `${emojiSign} `;
  });
}

function hr(inputHrStr: string, length?: number | false): string {
  const len = length || process.stdout.columns;
  return new Array(len).join(inputHrStr);
}

function undoColon(str: string): string {
  return str.replace(COLON_REPLACER_REGEXP, ':');
}

function generateTableRow(text: string, escape?: StyleFn): string[][] {
  if (!text) return [];
  const esc = escape || identity;
  const lines = esc(text).split('\n');

  const data: string[][] = [];
  lines.forEach((line) => {
    if (!line) return;
    const parsed = line.replace(TABLE_ROW_WRAP_REGEXP, '').split(TABLE_CELL_SPLIT);

    data.push(parsed.splice(0, parsed.length - 1));
  });
  return data;
}

function escapeRegExp(str: string): string {
  return str.replace(/[-[\]/{}()*+?.\\^$|]/g, '\\$&');
}

function unescapeEntities(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function identity(str: string): string {
  return str;
}

function compose(...funcs: ((...args: any[]) => any)[]): (...args: any[]) => any {
  return function (this: any, ...args: any[]) {
    let result = args;
    // eslint-disable-next-line space-in-parens
    for (let i = funcs.length; i-- > 0; ) {
      result = [funcs[i].apply(this, result)];
    }
    return result[0];
  };
}

function isAllowedTabString(s: string): boolean {
  return TAB_ALLOWED_CHARACTERS.some((char) => {
    return s.match(`^(${char})+$`);
  });
}

function sanitizeTab(tab: number | string, fallbackTab: number): string {
  if (typeof tab === 'number') {
    return new Array(tab + 1).join(' ');
  }
  if (typeof tab === 'string' && isAllowedTabString(tab)) {
    return tab;
  }
  return new Array(fallbackTab + 1).join(' ');
}

function indentLines(indent: string, text: string): string {
  return text.replace(/(^|\n)(.+)/g, `$1${indent}$2`);
}

function indentify(indent: string, text: string): string {
  if (!text) return text;
  return indent + text.split('\n').join(`\n${indent}`);
}

const BULLET_POINT_REGEX = '\\*';
const NUMBERED_POINT_REGEX = '\\d+\\.';
const POINT_REGEX = `(?:${[BULLET_POINT_REGEX, NUMBERED_POINT_REGEX].join('|')})`;

// Prevents nested lists from joining their parent list's last line
function fixNestedLists(body: string, indent: string): string {
  const regex = new RegExp(
    `` +
      `(\\S(?: |  )?)` + // Last char of current point, plus one or two spaces
      `((?:${indent})+)` + // Indentation of sub point
      `(${POINT_REGEX}(?:.*)+)$`, // Body of subpoint
    'gm',
  );
  return body.replace(regex, `$1\n${indent}$2$3`);
}

// Remove interior lines that are visually blank (only whitespace + ANSI codes).
// These are artifacts of fixNestedLists' regex, which incorrectly splits ANSI
// escape sequences when treating ESC chars as \S.
// Trailing newlines (section separators) are preserved so elements don't merge.
function stripArtifactBlankLines(text: string): string {
  const trailingMatch = text.match(/\n+$/);
  const trailing = trailingMatch ? trailingMatch[0] : '';
  const body = trailing ? text.slice(0, -trailing.length) : text;

  const cleaned = body
    .split('\n')
    .filter((line) => (stripAnsi(line) as string).trim() !== '')
    .join('\n');

  return cleaned + trailing;
}

// marked-terminal injects BULLET_POINT at the start of every list item before
// numbering. Matching `^\* ` (with no leading whitespace) identifies *top-level*
// items only, which lets us renumber ordered lists without miscounting indented
// sub-bullets.
const TOP_LEVEL_ITEM = /^\* /;

const isPointedLine = function (line: string, indent: string): RegExpMatchArray | null {
  return line.match(`^(?:${indent})*${POINT_REGEX}`);
};

function toSpaces(str: string): string {
  return ' '.repeat(str.length);
}

const BULLET_POINT = '* ';
function bulletPointLine(indent: string, line: string): string {
  return isPointedLine(line, indent) ? line : toSpaces(BULLET_POINT) + line;
}

function bulletPointLines(lines: string, indent: string): string {
  const transform = bulletPointLine.bind(null, indent);
  return lines
    .split('\n')
    .filter(identity as any)
    .map(transform)
    .join('\n');
}

const numberedPoint = function (n: number): string {
  return `${n}. `;
};
function numberedLine(indent: string, line: string, num: number): { num: number; line: string } {
  return isPointedLine(line, indent)
    ? {
        num: num + 1,
        line: line.replace(BULLET_POINT, numberedPoint(num + 1)),
      }
    : {
        num,
        line: toSpaces(numberedPoint(num)) + line,
      };
}

function numberedLines(lines: string, indent: string): string {
  const transform = numberedLine.bind(null, indent);
  let num = 0;
  return lines
    .split('\n')
    .filter(identity as any)
    .map((line) => {
      const numbered = transform(line, num);
      num = numbered.num;
      return numbered.line;
    })
    .join('\n');
}

function listFn(body: string, ordered: boolean, indent: string): string {
  let b = body.trim();
  b = ordered ? numberedLines(b, indent) : bulletPointLines(b, indent);
  return b;
}

// Munge \n's and spaces in "text" so that the number of
// characters between \n's is less than or equal to "width".
function reflowText(text: string, width: number, gfm?: boolean): string {
  const splitRe = gfm ? HARD_RETURN_GFM_RE : HARD_RETURN_RE;
  const sections = text.split(splitRe);
  const reflowed: string[] = [];

  sections.forEach((sec) => {
    const fragments = sec.split(/(\u001b\[(?:\d{1,3})(?:;\d{1,3})*m)/g);
    let column = 0;
    let currentLine = '';
    let lastWasEscapeChar = false;

    while (fragments.length) {
      const fragment = fragments[0];

      if (fragment === '') {
        fragments.splice(0, 1);
        lastWasEscapeChar = false;
        continue;
      }

      if (!textLength(fragment)) {
        currentLine += fragment;
        fragments.splice(0, 1);
        lastWasEscapeChar = true;
        continue;
      }

      const words = fragment.split(/[ \t\n]+/);

      for (let i = 0; i < words.length; i++) {
        let word = words[i];
        let addSpace = column !== 0;
        if (lastWasEscapeChar) addSpace = false;

        if (column + word.length + (addSpace ? 1 : 0) > width) {
          if (word.length <= width) {
            reflowed.push(currentLine);
            currentLine = word;
            column = word.length;
          } else {
            let w = word.substr(0, width - column - (addSpace ? 1 : 0));
            if (addSpace) currentLine += ' ';
            currentLine += w;
            reflowed.push(currentLine);
            currentLine = '';
            column = 0;

            word = word.substr(w.length);
            while (word.length) {
              w = word.substr(0, width);

              if (!w.length) break;

              if (w.length < width) {
                currentLine = w;
                column = w.length;
                break;
              } else {
                reflowed.push(w);
                word = word.substr(width);
              }
            }
          }
        } else {
          if (addSpace) {
            currentLine += ' ';
            column++;
          }

          currentLine += word;
          column += word.length;
        }

        lastWasEscapeChar = false;
      }

      fragments.splice(0, 1);
    }

    if (textLength(currentLine)) reflowed.push(currentLine);
  });

  return reflowed.join('\n');
}

class Renderer {
  o: RendererOptions;

  tab: string;

  tableSettings: any;

  emoji: (text: string) => string;

  unescape: (text: string) => string;

  highlightOptions: any;

  transform: (...args: any[]) => any;

  options: any;

  parser: any;

  constructor(options?: Partial<RendererOptions>, highlightOptions?: any) {
    this.o = { ...defaultOptions, ...options } as RendererOptions;
    this.tab = sanitizeTab(this.o.tab, defaultOptions.tab as number);
    this.tableSettings = this.o.tableOptions;
    this.emoji = this.o.emoji ? insertEmojis : identity;
    this.unescape = this.o.unescape ? unescapeEntities : identity;
    this.highlightOptions = highlightOptions || {};

    this.transform = compose(undoColon, this.unescape, this.emoji);
  }

  textLength(str: string): number {
    return textLength(str);
  }

  space(): string {
    return '';
  }

  text(text: string | { text: string }): string {
    if (typeof text === 'object') {
      text = text.text;
    }
    return this.o.text(text);
  }

  code(
    code: string | { text: string; lang?: string; escaped?: boolean },
    lang?: string,
    _escaped?: boolean,
  ): string {
    if (typeof code === 'object') {
      lang = code.lang;
      code = code.text;
    }
    // Render without extra indentation — code blocks at root level should not
    // be indented; only syntax highlighting / code style is applied.
    return section(highlightCode(code, lang, this.o, this.highlightOptions));
  }

  blockquote(quote: string | { tokens: any[] }): string {
    const q: string = typeof quote === 'object' ? this.parser.parse(quote.tokens) : quote;
    return section(this.o.blockquote(indentify(this.tab, q.trim())));
  }

  html(html: string | { text: string }): string {
    if (typeof html === 'object') {
      html = html.text;
    }
    return this.o.html(html);
  }

  heading(text: string | { depth: number; tokens: any[] }, level?: number): string {
    if (typeof text === 'object') {
      level = text.depth;
      text = this.parser.parseInline(text.tokens);
    }
    text = this.transform(text);

    const prefix = this.o.showSectionPrefix ? `${'#'.repeat(level ?? 1)} ` : '';
    text = prefix + text;
    if (this.o.reflowText) {
      text = reflowText(text, this.o.width, this.options?.gfm);
    }
    let styler: StyleFn;
    if (this.o.headingStyles) {
      styler = this.o.headingStyles[level ?? 1] ?? HEADING_STYLERS.default;
    } else {
      styler = (level ?? 1) === 1 ? this.o.firstHeading : this.o.heading;
    }

    return section(styler(text));
  }

  hr(): string {
    return section(this.o.hr(hr('-', this.o.reflowText && this.o.width)));
  }

  list(body: string | any, ordered?: boolean, start?: number): string {
    if (typeof body === 'object') {
      const listToken = body;
      ordered = listToken.ordered;
      start = listToken.start;
      body = '';
      for (let j = 0; j < listToken.items.length; j++) {
        body += this.listitem(listToken.items[j]);
      }
    }

    if (ordered) {
      // Fix: renumber top-level markers ourselves, then hand the already-numbered
      // body to the list function as unordered. This fixes:
      // - `start` param being ignored (numberedLines hardcodes `let num = 0`)
      // - Sub-bullets being miscounted as top-level items
      const startNum = Number.isFinite(start) && (start as number) >= 1 ? (start as number) : 1;
      let num = startNum;
      const renumbered = body
        .split('\n')
        .map((line: string) => {
          if (!TOP_LEVEL_ITEM.test(line)) return line;
          const replaced = line.replace(TOP_LEVEL_ITEM, `${num}. `);
          num += 1;
          return replaced;
        })
        .join('\n');

      const rendered = this.o.list(renumbered, false, this.tab);
      return stripArtifactBlankLines(
        section(fixNestedLists(indentLines(this.tab, rendered), this.tab)),
      );
    }

    body = this.o.list(body, ordered!, this.tab);
    return stripArtifactBlankLines(section(fixNestedLists(indentLines(this.tab, body), this.tab)));
  }

  listitem(text: string | any): string {
    if (typeof text === 'object') {
      const item = text;
      text = '';
      if (item.task) {
        const checkbox = this.checkbox({ checked: Boolean(item.checked) });
        if (item.loose) {
          if (item.tokens.length > 0 && item.tokens[0].type === 'paragraph') {
            item.tokens[0].text = `${checkbox} ${item.tokens[0].text}`;
            if (
              item.tokens[0].tokens &&
              item.tokens[0].tokens.length > 0 &&
              item.tokens[0].tokens[0].type === 'text'
            ) {
              item.tokens[0].tokens[0].text = `${checkbox} ${item.tokens[0].tokens[0].text}`;
            }
          } else {
            item.tokens.unshift({
              type: 'text',
              raw: `${checkbox} `,
              text: `${checkbox} `,
            });
          }
        } else {
          text += `${checkbox} `;
        }
      }

      text += this.parser.parse(item.tokens, Boolean(item.loose));
    }
    const transform = compose(this.o.listitem, this.transform);
    const isNested = text.indexOf('\n') !== -1;
    if (isNested) text = text.trim();

    return `\n${BULLET_POINT}${transform(text)}`;
  }

  checkbox(checked: boolean | { checked: boolean }): string {
    if (typeof checked === 'object') {
      checked = checked.checked;
    }
    return `[${checked ? 'X' : ' '}] `;
  }

  paragraph(text: string | { tokens: any[] }): string {
    let t: string = typeof text === 'object' ? this.parser.parseInline(text.tokens) : text;
    const transform = compose(this.o.paragraph, this.transform);
    t = transform(t);
    if (this.o.reflowText) {
      t = reflowText(t, this.o.width, this.options?.gfm);
    }
    return section(t);
  }

  table(header: string | any, body?: string): string {
    if (typeof header === 'object') {
      const token = header;
      header = '';

      let cell = '';
      for (let j = 0; j < token.header.length; j++) {
        cell += this.tablecell(token.header[j]);
      }
      header += this.tablerow({ text: cell });

      body = '';
      for (let j = 0; j < token.rows.length; j++) {
        const row = token.rows[j];

        cell = '';
        for (let k = 0; k < row.length; k++) {
          cell += this.tablecell(row[k]);
        }

        body += this.tablerow({ text: cell });
      }
    }

    // Constrain column widths so tables fit within the available terminal width.
    const savedSettings = this.tableSettings;
    const n = typeof header === 'string' ? header.split(TABLE_CELL_SPLIT).length - 1 : 0;
    if (n > 0) {
      const totalColWidth = this.o.width - n - 1;
      const colWidth = Math.max(4, Math.floor(totalColWidth / n));
      this.tableSettings = { ...savedSettings, wordWrap: true, colWidths: Array(n).fill(colWidth) };
    }

    try {
      const table = new Table({
        head: generateTableRow(header)[0],
        ...this.tableSettings,
      });

      generateTableRow(body!, this.transform).forEach((row) => {
        table.push(row);
      });
      return section(this.o.table(table.toString()));
    } finally {
      this.tableSettings = savedSettings;
    }
  }

  tablerow(content: string | { text: string }): string {
    if (typeof content === 'object') {
      content = content.text;
    }
    return `${TABLE_ROW_WRAP + content + TABLE_ROW_WRAP}\n`;
  }

  tablecell(content: string | { tokens: any[] }): string {
    if (typeof content === 'object') {
      content = this.parser.parseInline(content.tokens);
    }
    return content + TABLE_CELL_SPLIT;
  }

  strong(text: string | { tokens: any[] }): string {
    const t: string = typeof text === 'object' ? this.parser.parseInline(text.tokens) : text;
    return this.o.strong(t);
  }

  em(text: string | { tokens: any[] }): string {
    let t: string = typeof text === 'object' ? this.parser.parseInline(text.tokens) : text;
    t = fixHardReturn(t, this.o.reflowText);
    return this.o.em(t);
  }

  codespan(text: string | { text: string }): string {
    let t: string = typeof text === 'object' ? text.text : text;
    t = fixHardReturn(t, this.o.reflowText);
    return this.o.codespan(t.replace(/:/g, COLON_REPLACER));
  }

  br(): string {
    return this.o.reflowText ? HARD_RETURN : '\n';
  }

  del(text: string | { tokens: any[] }): string {
    const t: string = typeof text === 'object' ? this.parser.parseInline(text.tokens) : text;
    return this.o.del(t);
  }

  link(
    href: string | { title?: string; tokens: any[]; href: string },
    _title?: string,
    text?: string,
  ): string {
    if (typeof href === 'object') {
      text = this.parser.parseInline(href.tokens);
      href = href.href;
    }

    if (this.options?.sanitize) {
      try {
        const prot = decodeURIComponent(unescape(href))
          .replace(/[^\w:]/g, '')
          .toLowerCase();
        if (prot.indexOf('javascript:') === 0) {
          return '';
        }
      } catch (_e) {
        return '';
      }
    }

    const hasText = text && text !== href;

    let out = '';

    if (supportsHyperlinks()) {
      let linkText = '';
      if (text) {
        linkText = this.o.href(this.emoji(text));
      } else {
        linkText = this.o.href(href);
      }
      out = makeHyperlink(linkText, href.replace(/\+/g, '%20'));
    } else {
      if (hasText) out += `${this.emoji(text!)} (`;
      out += this.o.href(href);
      if (hasText) out += ')';
    }
    return this.o.link(out);
  }

  image(
    href: string | { title?: string; text: string; href: string },
    _title?: string,
    _text?: string,
  ): string {
    let h: string;
    let t: string | undefined;
    let tx: string | undefined;
    if (typeof href === 'object') {
      t = href.title;
      tx = href.text;
      h = href.href;
    } else {
      h = href;
      t = _title;
      tx = _text;
    }

    if (typeof this.o.image === 'function') {
      return this.o.image(h, t!, tx!);
    }
    let out = `![${tx}`;
    if (t) out += ` – ${t}`;
    return `${out}](${h})\n`;
  }
}

export { Renderer as default, TABLE_CELL_SPLIT };

export function markedTerminal(
  options?: Partial<RendererOptions>,
  highlightOptions?: any,
): { renderer: Record<string, any>; useNewRenderer: boolean } {
  const r = new Renderer(options, highlightOptions);

  const funcs = [
    'text',
    'code',
    'blockquote',
    'html',
    'heading',
    'hr',
    'list',
    'listitem',
    'checkbox',
    'paragraph',
    'table',
    'tablerow',
    'tablecell',
    'strong',
    'em',
    'codespan',
    'br',
    'del',
    'link',
    'image',
  ] as const;

  return funcs.reduce(
    (extension, func) => {
      extension.renderer[func] = function (this: any, ...args: any[]) {
        r.options = this.options;
        r.parser = this.parser;
        return (r as any)[func](...args);
      };
      return extension;
    },
    { renderer: {} as Record<string, any>, useNewRenderer: true },
  );
}
