import type { AhoCorasick } from '@monyone/aho-corasick';
import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { IDocContext, IDocTransformer } from '@gitlab-org/document';
import { Position, Range } from 'vscode-languageserver-protocol';
import { IParsedGitleaksRule, IParsedGitleaksGlobalAllowlist } from './gitleaks_rules';
import { GitLeaksRuleEvaluator, IRedactionMatch } from './gitleaks_rule_evaluator';
import { GitleaksRuleParser } from './gitleaks_rule_parser';
import { buildEnvVarRules, buildExactValueRule } from './custom_rules';

export interface RedactionResult {
  redacted: string;
  ranges: Range[];
}

export interface SecretRedactor {
  transform(context: IDocContext): IDocContext;
  redactSecrets(raw: string, sourceLocation: string): string;
  redactSecretsWithRanges(raw: string, sourceLocation: string): RedactionResult;
  addSensitiveEnvVarRules(env?: Record<string, string | undefined>): void;
  addExactSecretValues(values: string[]): void;
}

export const SecretRedactor = createInterfaceId<SecretRedactor>('SecretRedactor');

@Service({
  dependencies: [Logger, GitLeaksRuleEvaluator, GitleaksRuleParser],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(SecretRedactor)
export class DefaultSecretRedactor implements IDocTransformer {
  #logger: Logger;

  #evaluator: GitLeaksRuleEvaluator;

  #parser: GitleaksRuleParser;

  #globalKeywordsTrie: AhoCorasick | null;

  constructor(logger: Logger, evaluator: GitLeaksRuleEvaluator, parser: GitleaksRuleParser) {
    this.#logger = withPrefix(logger, '[SecretRedactor]');
    this.#evaluator = evaluator;
    this.#parser = parser;
    this.#globalKeywordsTrie = parser.getGlobalKeywordsTrie();
  }

  transform(context: IDocContext): IDocContext {
    return {
      prefix: this.redactSecrets(context.prefix, context.uri),
      suffix: this.redactSecrets(context.suffix, context.uri),
      fileRelativePath: context.fileRelativePath,
      position: context.position,
      uri: context.uri,
      languageId: context.languageId,
      workspaceFolder: context.workspaceFolder,
    };
  }

  addSensitiveEnvVarRules(env?: Record<string, string | undefined>): void {
    const rules = buildEnvVarRules(env);
    if (rules.length > 0) {
      this.#parser.addRules(rules);
      this.#globalKeywordsTrie = this.#parser.getGlobalKeywordsTrie();
    }
  }

  /**
   * Register known plaintext secrets for verbatim redaction. Use when the exact
   * value is already in hand (e.g. a scanner-detected secret passed in context)
   * so redaction does not depend on a pattern rule matching the value's format.
   */
  addExactSecretValues(values: string[]): void {
    const rules = values.flatMap((value, index) => {
      const rule = buildExactValueRule(
        `exact-secret-value-${index}`,
        'Known secret value provided as context.',
        value,
      );
      return rule ? [rule] : [];
    });

    if (rules.length > 0) {
      this.#parser.addRules(rules);
      this.#globalKeywordsTrie = this.#parser.getGlobalKeywordsTrie();
    }
  }

  redactSecrets(raw: string, sourceLocation: string): string {
    return this.redactSecretsWithRanges(raw, sourceLocation).redacted;
  }

  redactSecretsWithRanges(raw: string, sourceLocation: string): RedactionResult {
    const start = performance.now();
    if (raw === '') {
      this.#logger.debug(
        `Ran redaction in ${(performance.now() - start).toFixed(2)}ms for ${sourceLocation}, redacted 0 secret(s), evaluated 0 matching rules (empty file)`,
      );
      return { redacted: raw, ranges: [] };
    }

    const globalAllowlist = this.#parser.getGlobalAllowlist();
    if (this.#isPathGloballyAllowed(sourceLocation, globalAllowlist)) {
      this.#logger.debug(
        `Ran redaction in ${(performance.now() - start).toFixed(2)}ms for ${sourceLocation}, redacted 0 secret(s), evaluated 0 matching rules (path globally allowed)`,
      );
      return { redacted: raw, ranges: [] };
    }

    const foundKeywords = this.#scanForKeywords(raw);
    const rules = this.#parser.getParsedRules();
    let rulesEvaluated = 0;

    const allMatches: IRedactionMatch[] = [];

    for (const rule of rules) {
      if (!this.#ruleKeywordsFound(rule, foundKeywords)) {
        continue; // eslint-disable-line no-continue
      }

      rulesEvaluated++;
      const matches = this.#evaluator.evaluateRule(raw, rule, sourceLocation, globalAllowlist);
      allMatches.push(...matches);
    }

    this.#logger.debug(
      `Ran redaction in ${(performance.now() - start).toFixed(2)}ms for ${sourceLocation}, redacted ${allMatches.length} secret(s), evaluated ${rulesEvaluated}/${rules.length} matching rules`,
    );

    if (allMatches.length === 0) {
      return { redacted: raw, ranges: [] };
    }

    const redacted = this.#applyRedactions(raw, allMatches);
    const ranges = this.#convertMatchesToRanges(raw, allMatches);

    return { redacted, ranges };
  }

  #scanForKeywords(content: string): Set<string> {
    if (!this.#globalKeywordsTrie) {
      return new Set();
    }

    const foundKeywords = new Set<string>();
    const lowerContent = content.toLowerCase();
    const matches = this.#globalKeywordsTrie.matchInText(lowerContent);

    for (const match of matches) {
      foundKeywords.add(match.keyword);
    }

    return foundKeywords;
  }

  #ruleKeywordsFound(rule: IParsedGitleaksRule, foundKeywords: Set<string>): boolean {
    if (!rule.keywords || rule.keywords.length === 0) {
      // If rule has no keywords, always evaluate it
      return true;
    }

    return rule.keywords.some((keyword) => foundKeywords.has(keyword));
  }

  #isPathGloballyAllowed(
    sourceLocation: string,
    globalAllowlist: IParsedGitleaksGlobalAllowlist,
  ): boolean {
    return globalAllowlist.paths.some((pathRegex) => pathRegex.test(sourceLocation));
  }

  #applyRedactions(str: string, matches: IRedactionMatch[]): string {
    if (matches.length === 0) {
      return str;
    }

    // Sort matches in reverse order so we can replace from end to start
    // This ensures indices remain valid as we modify the string
    const sortedMatches = [...matches].sort((a, b) => b.startIndex - a.startIndex);

    let result = str;
    for (const match of sortedMatches) {
      const before = result.substring(0, match.startIndex);
      const after = result.substring(match.endIndex);
      const redacted = '*'.repeat(match.secret.length);
      result = before + redacted + after;
    }

    return result;
  }

  #convertMatchesToRanges(text: string, matches: IRedactionMatch[]): Range[] {
    if (matches.length === 0) {
      return [];
    }

    const sortedMatches = [...matches].sort((a, b) => a.startIndex - b.startIndex);

    const deduplicatedMatches = sortedMatches.reduce<IRedactionMatch[]>((acc, match) => {
      const lastMatch = acc[acc.length - 1];
      if (
        lastMatch &&
        match.startIndex === lastMatch.startIndex &&
        match.endIndex === lastMatch.endIndex
      ) {
        return acc;
      }
      return [...acc, match];
    }, []);

    return deduplicatedMatches.map(({ startIndex, endIndex }) => {
      const startPos = this.#offsetToPosition(text, startIndex);
      const endPos = this.#offsetToPosition(text, endIndex);
      return Range.create(startPos, endPos);
    });
  }

  #offsetToPosition(text: string, offset: number): Position {
    let line = 0;
    let character = 0;
    for (let i = 0; i < offset; i++) {
      if (text[i] === '\n') {
        line++;
        character = 0;
      } else {
        character++;
      }
    }
    return Position.create(line, character);
  }
}
