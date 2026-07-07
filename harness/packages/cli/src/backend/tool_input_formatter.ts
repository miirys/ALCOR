import { Service, ServiceLifetime, collection } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ToolInputFormatter } from '@gitlab-org/workflow-executor/node';
import { ToolInputDisplay } from '@gitlab-lsp/workflow-api';
import { ParsedCliInput } from '../parse';

/**
 * Resolves the right {@link ToolInputFormatter} for a tool name and delegates to
 * it, falling back to a generic display when none matches. The class is its own
 * DI token.
 */
@Service({
  dependencies: [ParsedCliInput, collection(ToolInputFormatter), Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class ToolInputFormatterService {
  #formattersByName: Map<string, ToolInputFormatter>;

  #matchingFormatters: ToolInputFormatter[];

  #workspaceFolderPath: string;

  #logger: Logger;

  constructor(cliInput: ParsedCliInput, formatters: ToolInputFormatter[], logger: Logger) {
    this.#formattersByName = new Map(
      formatters.map((formatter) => [formatter.toolName, formatter]),
    );
    this.#matchingFormatters = formatters.filter((formatter) => formatter.matches);
    this.#workspaceFolderPath = cliInput.cwd;
    this.#logger = withPrefix(logger, '[ToolInputFormatterService]');
  }

  async formatToolInput(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<ToolInputDisplay> {
    const formatter =
      this.#formattersByName.get(toolName) ??
      this.#matchingFormatters.find((candidate) => candidate.matches?.(toolName));

    if (!formatter) {
      return { tool: 'generic', name: toolName, args };
    }

    try {
      return await formatter.format(args, {
        workspaceFolderPath: this.#workspaceFolderPath,
        toolName,
      });
    } catch (error) {
      this.#logger.warn(
        `Formatter for tool "${toolName}" failed; falling back to generic display. Args: ${JSON.stringify(args)}`,
        error instanceof Error ? error : new Error(String(error)),
      );
      return { tool: 'generic', name: toolName, args };
    }
  }
}
