import { useMemo } from 'react';
import { parse } from 'marked';
import { Text } from 'ink';
import wrapAnsi from 'wrap-ansi';
import stripAnsi from 'strip-ansi';
import stringWidth from 'string-width';
import chalk from 'chalk';
import { markedTerminal } from '../vendor/marked-terminal/index';

export { TABLE_CELL_SPLIT } from '../vendor/marked-terminal/index';

export type Props = {
  markdown: string;
  availableWidth?: number;
  prefix?: string;
  maxLines?: number;
};

export function processContent(
  text: string,
  columns: number,
  prefix?: string,
  maxLines?: number,
): string {
  const cols = Math.max(1, columns);
  // Pre-wrap every line at `cols` so Ink never needs to re-wrap.
  // List items get a hanging indent; all other long lines wrap cleanly.
  const lines = text.split('\n').flatMap((line) => {
    const stripped = stripAnsi(line) as string;
    if (stringWidth(stripped) <= cols) return [line];

    const prefixMatch = stripped.match(/^(\s*(?:\d+\.|[•*-])\s+)/);
    if (prefixMatch) {
      // List item: wrap with hanging indent so continuation lines align
      const listPrefixLen = prefixMatch[1].length;
      const wrapped: string = wrapAnsi(line, cols, { hard: false, trim: false });
      const wrappedLines = wrapped.split('\n');
      const hangingIndent = ' '.repeat(listPrefixLen);
      return [
        wrappedLines[0],
        ...wrappedLines.slice(1).map((l: string) => hangingIndent + l.trimStart()),
      ];
    }

    // Regular line: wrap without hanging indent
    return (wrapAnsi(line, cols, { hard: false, trim: false }) as string).split('\n');
  });

  // Apply prefix / indent
  const indentWidth = prefix ? stringWidth(stripAnsi(prefix) as string) : 0;
  const indent = ' '.repeat(indentWidth);
  let firstFound = false;
  const prefixedLines = lines.map((line) => {
    if (!prefix || !(stripAnsi(line) as string).trim()) return line;
    if (!firstFound) {
      firstFound = true;
      return prefix + line;
    }
    return indent + line;
  });

  // Fallback: if prefix was provided but no visible line was found (e.g. all lines
  // were ANSI-only), attach the prefix to the first line so the indicator always appears.
  if (prefix && !firstFound && prefixedLines.length > 0) {
    prefixedLines[0] = prefix + prefixedLines[0];
  }

  // Collapse consecutive blank lines to at most one to prevent double-blank-line
  // artifacts from marked-terminal while preserving all paragraph separations.
  const result: string[] = [];
  let lastWasBlank = false;
  for (const line of prefixedLines) {
    const isBlank = !(stripAnsi(line) as string).trim();
    if (isBlank) {
      if (!lastWasBlank) result.push(line);
      lastWasBlank = true;
    } else {
      result.push(line);
      lastWasBlank = false;
    }
  }
  const trimmed = maxLines !== undefined ? result.slice(-maxLines) : result;
  return trimmed.join('\n');
}

export function Markdown({ markdown, availableWidth = 80, prefix, maxLines }: Props) {
  const extension = useMemo(
    () =>
      markedTerminal({
        tab: 2,
        width: availableWidth,
        headingStyles: {
          1: chalk.cyan.bold.underline,
          2: chalk.cyan.bold,
          3: chalk.cyan,
          4: chalk.cyan,
          5: chalk.cyan,
          6: chalk.cyan,
        },
      }),
    [availableWidth],
  );

  const content = useMemo(() => {
    // markedTerminal() returns a marked extension object with partial renderer methods;
    // the type doesn't overlap with MarkedOptions but is valid at runtime.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const parsed = (parse as any)(markdown, extension) as string;
    return parsed.trim();
  }, [markdown, extension]);

  const processed = useMemo(
    () => processContent(content, availableWidth, prefix, maxLines),
    [content, availableWidth, prefix, maxLines],
  );

  return <Text>{processed}</Text>;
}
