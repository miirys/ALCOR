import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import type {
  AggregatedSessionStartResult,
  CommandHook,
  HookResult,
  MatcherGroup,
  SessionStartInput,
  SessionStartOutput,
} from './types';
import { HookConfigLoader, type HookConfigLoaderOptions } from './hook_config_loader';
import { HookExecutor } from './hook_executor';

export interface HookServiceOptions extends HookConfigLoaderOptions {}

export interface HookService {
  runSessionStart(
    sessionId: string,
    cwd: string,
    transcriptPath: string,
    source: 'startup' | 'resume',
    options?: HookServiceOptions,
  ): Promise<AggregatedSessionStartResult>;
}

export const HookService = createInterfaceId<HookService>('HookService');

@Implements(HookService)
@Service({
  dependencies: [Logger, HookConfigLoader, HookExecutor],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultHookService implements HookService {
  #logger: Logger;

  #configLoader: HookConfigLoader;

  #executor: HookExecutor;

  constructor(logger: Logger, configLoader: HookConfigLoader, executor: HookExecutor) {
    this.#logger = withPrefix(logger, '[HookService]');
    this.#configLoader = configLoader;
    this.#executor = executor;
  }

  async runSessionStart(
    sessionId: string,
    cwd: string,
    transcriptPath: string,
    source: 'startup' | 'resume',
    options?: HookServiceOptions,
  ): Promise<AggregatedSessionStartResult> {
    const config = await this.#configLoader.load(cwd, options);
    const groups = config.hooks?.SessionStart ?? [];

    // SessionStart uses matcher against source
    const matchedHooks = this.#matchHooks(groups, source);
    this.#logger.debug(
      `SessionStart: source=${source} groups=${groups.length} matched=${matchedHooks.length}`,
    );
    if (matchedHooks.length === 0) {
      return {};
    }

    const input: SessionStartInput = {
      session_id: sessionId,
      cwd,
      transcript_path: transcriptPath,
      hook_event_name: 'SessionStart',
      source,
    };

    const envVars: Record<string, string> = {
      DUO_SESSION_ID: sessionId,
      DUO_PROJECT_DIR: cwd,
      DUO_ENV_FILE: '',
      // compatibility with Claude
      CLAUDE_SESSION_ID: sessionId,
      CLAUDE_PROJECT_DIR: cwd,
      CLAUDE_ENV_FILE: '',
    };
    const stdinJson = JSON.stringify(input);

    const results = await Promise.all(
      matchedHooks.map((hook) =>
        this.#executor.executeHook(
          hook.command,
          stdinJson,
          envVars,
          hook.timeout !== undefined ? hook.timeout * 1000 : undefined,
          cwd,
        ),
      ),
    );

    return this.#aggregateSessionStartResults(results);
  }

  #matchHooks(groups: MatcherGroup[], value: string): CommandHook[] {
    const matched: CommandHook[] = [];

    for (const group of groups) {
      if (this.#matcherMatches(group.matcher, value)) {
        matched.push(...group.hooks);
      }
    }

    return matched;
  }

  #matcherMatches(matcher: string | undefined, value: string): boolean {
    if (!matcher || matcher === '' || matcher === '.*') return true;

    try {
      const regex = new RegExp(matcher);
      return regex.test(value);
    } catch {
      this.#logger.warn(`Invalid matcher regex: ${matcher}`);
      return false;
    }
  }

  #aggregateSessionStartResults(results: HookResult[]): AggregatedSessionStartResult {
    const actionable = results.filter((r) => !r.timedOut);

    // Log warnings for error exit codes (non-blocking for SessionStart)
    for (const result of actionable.filter((r) => r.exitCode === 2)) {
      if (result.stderr) {
        this.#logger.warn(`SessionStart hook error: ${result.stderr}`);
      }
    }
    for (const result of actionable.filter((r) => r.exitCode !== 0 && r.exitCode !== 2)) {
      if (result.stderr) {
        this.#logger.warn(`SessionStart hook non-zero exit (${result.exitCode}): ${result.stderr}`);
      }
    }

    // Exit 0: check for JSON additionalContext first, then plain text stdout
    const exit0Results = actionable.filter((r) => r.exitCode === 0);
    const contextParts = exit0Results
      .map((result) => {
        const parsed = result.parsedOutput as SessionStartOutput | null;
        if (parsed?.hookSpecificOutput?.additionalContext) {
          return parsed.hookSpecificOutput.additionalContext;
        }
        return result.stdout.trim() || undefined;
      })
      .filter((c): c is string => Boolean(c));

    return {
      additionalContext: contextParts.length > 0 ? contextParts.join('\n') : undefined,
    };
  }
}
