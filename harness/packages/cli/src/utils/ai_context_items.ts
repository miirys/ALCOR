import { InvalidOptionArgumentError } from 'commander';
import { AIContextItem } from '@gitlab-org/ai-context';

export function tryParseAiContextItems(value: string): AIContextItem[] {
  try {
    const parsed = JSON.parse(value);

    // Normalize the parsed items to handle both capitalized (Go executor) and lowercase field names
    const normalized = Array.isArray(parsed)
      ? parsed.map((item) => ({
          category: (item.Category || item.category) as string,
          content: (item.Content || item.content) as string,
          metadata: item.metadata || {},
        }))
      : [];

    return normalized as AIContextItem[];
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new InvalidOptionArgumentError(`Invalid JSON format: ${error.message}`);
    }
    throw new InvalidOptionArgumentError(`AI Context Item schema error: ${error}`);
  }
}
