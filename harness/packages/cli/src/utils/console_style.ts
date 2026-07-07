export function style(code: string, text: string): string {
  return process.stdout.isTTY ? `\x1b[${code}m${text}\x1b[0m` : text;
}

export function bold(text: string): string {
  return style('1', text);
}

export function dim(text: string): string {
  return style('2', text);
}
