import { Marked } from '@ts-stack/markdown';

export function renderVulnerabilityDetailsMarkdown(md: string): string {
  if (!md) {
    return '';
  }

  try {
    return Marked.parse(md.toString());
  } catch {
    return md;
  }
}
