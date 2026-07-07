import { readFile } from 'fs/promises';
import { join } from 'path';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { getDuoConfigFilePath } from '@gitlab-org/ai-configuration';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { parseHooksConfigLeniently } from './schema';
import type { HooksConfig } from './types';

export interface HookConfigLoaderOptions {
  enableProjectHooks?: boolean;
}

export interface HookConfigLoader {
  load(cwd: string, options?: HookConfigLoaderOptions): Promise<HooksConfig>;
}

export const HookConfigLoader = createInterfaceId<HookConfigLoader>('HookConfigLoader');

@Implements(HookConfigLoader)
@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultHookConfigLoader implements HookConfigLoader {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[HookConfigLoader]');
  }

  async load(cwd: string, options?: HookConfigLoaderOptions): Promise<HooksConfig> {
    const enableProjectHooks = options?.enableProjectHooks ?? false;

    const [globalConfig, projectConfig] = await Promise.all([
      this.#loadGlobalConfig(),
      enableProjectHooks
        ? this.#loadProjectConfig(cwd)
        : Promise.resolve({} as HooksConfig).then((c) => {
            this.#logger.debug(
              'Project hooks are disabled. Use --enable-project-hooks or GITLAB_ENABLE_PROJECT_HOOKS=true to enable.',
            );
            return c;
          }),
    ]);

    return this.#mergeConfigs(globalConfig, projectConfig);
  }

  async #loadGlobalConfig(): Promise<HooksConfig> {
    const configPath = getDuoConfigFilePath('hooks.json');
    if (!configPath) {
      this.#logger.debug('Could not determine global config directory');
      return {};
    }
    this.#logger.debug(`Loading global hooks config from ${configPath}`);
    try {
      const content = await readFile(configPath, 'utf8');
      const parsed = JSON.parse(content);
      const validated = parseHooksConfigLeniently(parsed, (msg) => this.#logger.warn(msg));
      const eventCount = Object.keys(validated.hooks ?? {}).length;
      this.#logger.debug(`Loaded global hooks config: ${eventCount} event type(s) configured`);
      return validated;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.#logger.debug(`No global hooks config found at ${configPath}`);
      } else {
        this.#logger.warn(
          `Failed to load global hooks config from ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return {};
    }
  }

  async #loadProjectConfig(cwd: string): Promise<HooksConfig> {
    const configPath = join(cwd, '.gitlab', 'duo', 'hooks.json');
    this.#logger.debug(`Loading project hooks config from ${configPath}`);
    try {
      const content = await readFile(configPath, 'utf8');
      const parsed = JSON.parse(content);
      const validated = parseHooksConfigLeniently(parsed, (msg) => this.#logger.warn(msg));
      const eventCount = Object.keys(validated.hooks ?? {}).length;
      this.#logger.debug(`Loaded project hooks config: ${eventCount} event type(s) configured`);
      return validated;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        this.#logger.debug(`No project hooks config found at ${configPath}`);
      } else {
        this.#logger.warn(
          `Failed to load project hooks config from ${configPath}: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
      return {};
    }
  }

  #mergeConfigs(global: HooksConfig, project: HooksConfig): HooksConfig {
    const events = ['SessionStart'] as const;
    const hooks: NonNullable<HooksConfig['hooks']> = {};

    for (const event of events) {
      const globalGroups = global.hooks?.[event] ?? [];
      const projectGroups = project.hooks?.[event] ?? [];
      const combined = [...globalGroups, ...projectGroups];
      if (combined.length > 0) {
        hooks[event] = combined;
      }
    }

    return { hooks };
  }
}
