import { join } from 'path';
import { collection, Injectable } from '@gitlab/needle';
import { BareService, createFallbackService } from '@gitlab-org/core';
import { Logger, NullLogger, withPrefix } from '@gitlab-org/logging';
import { FileAccessService, FileNotFoundError, parseURIString } from '@gitlab-org/fs';
import { ConfigService } from '@gitlab-org/config';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { getDuoConfigDir } from '@gitlab-org/ai-configuration';
import { SystemContextProvider } from '../../system_context';
import { AIContextItem } from '../../index';
import { AgentsMdResolver } from './agents_md_resolver';
import { AgentSkillsResolver } from './agent_skills_resolver';

export interface UserRuleContextItem extends AIContextItem {
  category: 'user_rule';
}

type RuleType = 'user' | 'workspace';

@Injectable(SystemContextProvider, [
  Logger,
  collection(FileAccessService),
  ConfigService,
  AgentsMdResolver,
  AgentSkillsResolver,
])
export class DefaultUserRuleContextProvider implements SystemContextProvider {
  chatRequiredFeature = DuoFeature.IncludeUserRule;

  #logger: Logger;

  #fileAccessService: BareService<FileAccessService>;

  #configService: ConfigService;

  #cachedItems: Promise<AIContextItem[]> | null = null;

  #agentsMdResolver: AgentsMdResolver;

  #agentSkillsResolver: AgentSkillsResolver;

  constructor(
    logger: Logger,
    fileAccessServices: FileAccessService[],
    configService: ConfigService,
    agentsMdResolver: AgentsMdResolver,
    agentSkillsResolver: AgentSkillsResolver,
  ) {
    this.#logger = withPrefix(logger, '[UserRuleContextProvider]');
    this.#configService = configService;
    this.#fileAccessService = createFallbackService(new NullLogger(), fileAccessServices);
    this.#agentsMdResolver = agentsMdResolver;
    this.#agentSkillsResolver = agentSkillsResolver;
  }

  async precalculateOnWorkflowStart(): Promise<void> {
    this.#cachedItems = this.#calculateItems();

    try {
      await this.#cachedItems;
      this.#logger.info('User rules context precalculated and cached');
    } catch (error) {
      this.#logger.error('Failed to precalculate user rules context', error);
    }
  }

  async getItems(): Promise<AIContextItem[]> {
    if (!this.#cachedItems) {
      this.#cachedItems = this.#calculateItems();
    }
    return this.#cachedItems;
  }

  async #readRuleFile(filePath: string, type: RuleType): Promise<UserRuleContextItem | null> {
    const capType = `${type.charAt(0).toUpperCase()}${type.slice(1)}`;
    const metadata = {
      id: `${type}-config-rules`,
      title: `${capType} rules`,
      icon: 'folder',
      secondaryText: `${capType} config chat-rules.md`,
      subTypeLabel: `${capType} rules`,
    };
    const notFoundMessage = `${capType}-level Duo Chat rules file not found at ${filePath}, no user rules applied.`;

    try {
      const ruleContent = await this.#fileAccessService.getText(filePath);
      this.#logger.info(`${metadata.title} loaded from ${filePath}`);
      return {
        category: 'user_rule',
        content: `The user wants you to adhere to these rules:\n${ruleContent.trim()}`,
        id: metadata.id,
        metadata: {
          title: metadata.title,
          enabled: true,
          subType: 'user_rule',
          icon: metadata.icon,
          secondaryText: metadata.secondaryText,
          subTypeLabel: metadata.subTypeLabel,
        },
      };
    } catch (error) {
      if (error instanceof FileNotFoundError) {
        this.#logger.info(notFoundMessage);
      } else {
        this.#logger.warn(`Could not read ${type} rules file from ${filePath}`, error);
      }
      return null;
    }
  }

  async #calculateItems(): Promise<AIContextItem[]> {
    const items: AIContextItem[] = [];

    // Read user-level rules from config path
    // Check GLAB_CONFIG_DIR first, then fall back to env-paths
    const userConfigDir = process.env.GLAB_CONFIG_DIR || getDuoConfigDir();
    if (userConfigDir) {
      const userRulePath = join(userConfigDir, 'chat-rules.md');

      const userRule = await this.#readRuleFile(userRulePath, 'user');
      if (userRule) {
        items.push(userRule);
      }
    }

    const agentsMd = await this.#agentsMdResolver.resolveAgentsMdContextItem();
    if (agentsMd) {
      items.push(agentsMd);
    }

    const agentSkills = await this.#agentSkillsResolver.resolveAgentSkillsContextItem();
    items.push(agentSkills);

    // Read workspace-level rules
    const config = this.#configService.get();
    const workspaceFolders = config.workspaceFolders || [];
    if (workspaceFolders.length > 0) {
      const workspaceFolderPath = parseURIString(workspaceFolders[0].uri).fsPath;
      const workspaceRulePath = join(workspaceFolderPath, '.gitlab', 'duo', 'chat-rules.md');

      const workspaceRule = await this.#readRuleFile(workspaceRulePath, 'workspace');
      if (workspaceRule) {
        items.push(workspaceRule);
      }
    }

    return items;
  }
}
