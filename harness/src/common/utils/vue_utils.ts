export function extractScript(content: string) {
  const match = content.match(/<script(?:\s+[^>]*)?\s*>([\s\S]*?)<\/script>/i);
  if (!match) return undefined;

  const [scriptTag, scriptContent] = match;
  const language = scriptTag.match(/\blang=["'](\w+)["']/i)?.[1] || 'js';
  const scriptStartCharacter = (match.index ?? 0) + scriptTag.indexOf('>') + 1;
  const scriptStartLine = content.slice(0, scriptStartCharacter).split('\n').length - 1;

  return { scriptContent, scriptStartCharacter, scriptStartLine, language };
}
