import { AhoCorasick } from '@monyone/aho-corasick';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  IParsedGitleaksGlobalAllowlist,
  IParsedGitleaksRule,
  IParsedGitleaksRuleAllowlist,
  IRawGitleaksGlobalAllowlist,
  IRawGitleaksRule,
  IRawGitleaksRuleAllowlist,
  fullConfig,
} from './gitleaks_rules';
import { convertToJavaScriptRegex } from './helpers';

/**
 * Service responsible for parsing and compiling gitleaks rules from raw configuration.
 * Handles regex compilation, pattern conversion, and rule preparation.
 */
@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class GitleaksRuleParser {
  #rules: IParsedGitleaksRule[];

  #globalAllowlist: IParsedGitleaksGlobalAllowlist;

  #globalKeywordsTrie: AhoCorasick | null = null;

  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[GitleaksRuleParser]');

    this.#rules = fullConfig.rules.map((rule) => this.#parseRule(rule));
    this.#globalAllowlist = this.#parseGlobalAllowlist(fullConfig.allowlist);

    this.#buildGlobalKeywordsTrie();

    this.#logger.debug(`Parsed ${this.#rules.length} gitleaks rules`);
  }

  getParsedRules(): IParsedGitleaksRule[] {
    return this.#rules;
  }

  addRules(rawRules: IRawGitleaksRule[]): void {
    const parsed = rawRules.map((rule) => this.#parseRule(rule));
    this.#rules.push(...parsed);
    this.#buildGlobalKeywordsTrie();
    this.#logger.debug(`Added ${parsed.length} dynamic rules (total: ${this.#rules.length})`);
  }

  getGlobalAllowlist(): IParsedGitleaksGlobalAllowlist {
    return this.#globalAllowlist;
  }

  getGlobalKeywordsTrie(): AhoCorasick | null {
    return this.#globalKeywordsTrie;
  }

  #buildGlobalKeywordsTrie(): void {
    // Aggregate all unique keywords from all rules (already lowercased in raw config)
    const allKeywords = new Set<string>(this.#rules.flatMap((rule) => rule.keywords || []));

    if (allKeywords.size > 0) {
      this.#globalKeywordsTrie = new AhoCorasick(Array.from(allKeywords));
      this.#logger.debug(`Built Aho-Corasick trie with ${allKeywords.size} unique keywords`);
    } else {
      this.#logger.debug('No keywords found in rules, skipping Aho-Corasick trie construction');
    }
  }

  #parseRule(raw: IRawGitleaksRule): IParsedGitleaksRule {
    return {
      ...raw,
      regex: this.#safeCompileRegex(raw.regex, { global: true, multiline: true }),
      path: this.#safeCompileRegex(raw.path, { global: false, multiline: false }),
      allowlists:
        raw.allowlists?.map((allowlist) => this.#parseRuleAllowlist(allowlist)) || undefined,
    };
  }

  #safeCompileRegex(
    pattern: string | undefined,
    options: { global?: boolean; multiline?: boolean } = {},
  ): RegExp | undefined {
    if (!pattern) return undefined;

    try {
      const conversionResult = convertToJavaScriptRegex(pattern);

      let flags = '';
      if (options.global) flags += 'g';
      if (options.multiline) flags += 'm';
      if (conversionResult.caseInsensitive) flags += 'i';

      return new RegExp(conversionResult.pattern, flags);
    } catch (err) {
      this.#logger.debug(`Failed to parse regex pattern. ${JSON.stringify({ pattern, err })}`);
      return undefined;
    }
  }

  #normalizeCondition(condition?: string): 'and' | 'or' {
    if (!condition) return 'or'; // Default
    const normalized = condition.toLowerCase().trim();
    return normalized === 'and' || normalized === '&&' ? 'and' : 'or';
  }

  #parseRuleAllowlist(raw: IRawGitleaksRuleAllowlist): IParsedGitleaksRuleAllowlist {
    return {
      description: raw.description,
      regexTarget: raw.regexTarget || 'secret', // Default to 'secret'
      condition: this.#normalizeCondition(raw.condition),
      stopwords: raw.stopwords,
      regexes:
        (raw.regexes
          ?.map((pattern) => this.#safeCompileRegex(pattern, { global: false, multiline: false }))
          .filter(Boolean) as RegExp[]) || undefined,
      paths:
        (raw.paths
          ?.map((pattern) => this.#safeCompileRegex(pattern, { global: false, multiline: false }))
          .filter(Boolean) as RegExp[]) || undefined,
    };
  }

  #parseGlobalAllowlist(raw: IRawGitleaksGlobalAllowlist): IParsedGitleaksGlobalAllowlist {
    return {
      ...raw,
      regexes: raw.regexes
        .map((pattern) => this.#safeCompileRegex(pattern, { global: false, multiline: false }))
        .filter(Boolean) as RegExp[],
      paths: raw.paths
        .map((pattern) => this.#safeCompileRegex(pattern, { global: false, multiline: false }))
        .filter(Boolean) as RegExp[],
    };
  }
}
