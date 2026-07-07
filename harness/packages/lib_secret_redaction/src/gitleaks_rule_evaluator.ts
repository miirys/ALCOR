import { Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  IParsedGitleaksGlobalAllowlist,
  IParsedGitleaksRule,
  IParsedGitleaksRuleAllowlist,
} from './gitleaks_rules';
import { calculateShannonEntropy } from './shannon_entropy';

/**
 * Represents a secret match that should be redacted.
 */
export interface IRedactionMatch {
  secret: string;
  startIndex: number;
  endIndex: number;
}

/**
 * Represents a single regex match from a gitleaks rule, used for further allowlist evaluation
 */
interface IFinding {
  secret: string;
  match: string;
  line: string;
}

/**
 * Evaluates gitleaks rules against content to find secrets that should be redacted.
 * Implements the gitleaks detection algorithm including secret extraction
 * and allowlist evaluation.
 *
 * Note: Keyword pre-filtering is handled at the SecretRedactor level, so this evaluator
 * should only be called with relevant rules already pre-filtered for the content.
 */
@Service({
  dependencies: [Logger],
  lifetime: ServiceLifetime.Singleton,
})
export class GitLeaksRuleEvaluator {
  #logger: Logger;

  constructor(logger: Logger) {
    this.#logger = withPrefix(logger, '[GitLeaksRuleEvaluator]');
  }

  /**
   * Evaluates a single rule against content and returns matches that should be redacted.
   * Follows the gitleaks algorithm:
   * 1. Check path constraints
   * 2. Handle path-only rules (path without regex)
   * 3. Apply regex matching
   * 4. Extract secret using secretGroup
   * 5. Check entropy threshold (if configured)
   * 6. Check global and rule allowlists
   *
   * Note: Keyword pre-filtering is handled by SecretRedactor before this method is called
   */
  evaluateRule(
    content: string,
    rule: IParsedGitleaksRule,
    sourceLocation: string,
    globalAllowlist: IParsedGitleaksGlobalAllowlist,
  ): IRedactionMatch[] {
    if (rule.path && !rule.path.test(sourceLocation)) {
      return [];
    }

    if (rule.path && !rule.regex) {
      this.#logger.debug(`Path-only rule ${rule.id} matched for ${sourceLocation}`);
      // For path-only rules, the entire file content is the "secret"
      // We redact the entire file when a path-only rule matches
      return [
        {
          secret: content, // The entire content is the secret
          startIndex: 0,
          endIndex: content.length,
        },
      ];
    }

    if (!rule.regex) {
      return [];
    }

    const matches = [...content.matchAll(rule.regex)];
    if (matches.length === 0) {
      return [];
    }

    this.#logger.debug(`Found ${matches.length} potential secrets using rule ${rule.id}`);

    const redactionMatches: IRedactionMatch[] = [];

    for (const match of matches) {
      const secret = this.#extractSecret(match[0], rule.regex, rule.secretGroup);
      if (!secret) {
        // Invalid secretGroup or no valid groups, skip this finding
        continue; // eslint-disable-line no-continue
      }

      if (rule.entropy !== undefined) {
        const entropy = calculateShannonEntropy(secret);
        if (entropy <= rule.entropy) {
          this.#logger.debug(
            `Skipping secret in ${sourceLocation} for rule ${rule.id} - entropy ${entropy.toFixed(2)} <= threshold ${rule.entropy}`,
          );
          continue; // eslint-disable-line no-continue
        }
      }

      const finding: IFinding = {
        secret,
        match: match[0],
        line: this.#getLineFromMatch(content, match),
      };

      if (this.#isSecretGloballyAllowed(finding, globalAllowlist)) {
        this.#logger.debug(
          `Skipping secret in ${sourceLocation} for rule ${rule.id} - global allowlist match`,
        );
        continue; // eslint-disable-line no-continue
      }

      if (rule.allowlists && this.#checkFindingAllowed(finding, sourceLocation, rule.allowlists)) {
        this.#logger.debug(
          `Skipping secret in ${sourceLocation} for rule ${rule.id} - rule allowlist match`,
        );
        continue; // eslint-disable-line no-continue
      }

      // Calculate the actual position of the secret within the match
      const secretStartOffset = match[0].indexOf(secret);
      const startIndex = (match.index ?? 0) + secretStartOffset;
      const endIndex = startIndex + secret.length;

      redactionMatches.push({
        secret,
        startIndex,
        endIndex,
      });
    }

    return redactionMatches;
  }

  #extractSecret(fullMatch: string, regex: RegExp, secretGroup?: number): string | undefined {
    // Re-run regex to get capture groups (gitleaks does this with FindStringSubmatch)
    const groups = regex.exec(fullMatch);
    if (!groups || groups.length < 2) {
      // No capture groups, use full match
      return fullMatch;
    }

    // Reset regex state since exec() is stateful with 'g' flag
    // (we mutate/re-assign the param rather than re-creating a new regex instance to avoid the overhead of creating regexes many times)
    regex.lastIndex = 0; // eslint-disable-line no-param-reassign

    if (secretGroup !== undefined && secretGroup > 0) {
      // Specific group requested
      if (groups.length > secretGroup && groups[secretGroup]) {
        return groups[secretGroup];
      }

      // Invalid secretGroup specified, skip this finding (equivalent to gitleaks behaviour)
      return undefined;
    }

    // Find first non-empty capture group (secretGroup = 0 or unset)
    for (let i = 1; i < groups.length; i++) {
      const group = groups[i];
      if (group && group.length > 0) {
        return group;
      }
    }

    // All capture groups are empty, use full match
    return fullMatch;
  }

  #getLineFromMatch(text: string, match: RegExpMatchArray): string {
    if (match.index === undefined) return '';

    const beforeMatch = text.substring(0, match.index);
    const afterMatch = text.substring(match.index + match[0].length);

    // Find the start of the line containing the match
    const lastNewlineIndex = beforeMatch.lastIndexOf('\n');
    const lineStart = lastNewlineIndex === -1 ? 0 : lastNewlineIndex + 1;

    // Find the end of the line containing the match
    const nextNewlineIndex = afterMatch.indexOf('\n');
    const lineEnd =
      nextNewlineIndex === -1 ? text.length : match.index + match[0].length + nextNewlineIndex;

    return text.substring(lineStart, lineEnd);
  }

  #isSecretGloballyAllowed(
    finding: IFinding,
    globalAllowlist: IParsedGitleaksGlobalAllowlist,
  ): boolean {
    // Check global allowlist regexes against the matched secret
    const regexAllowed = globalAllowlist.regexes.some((regex) => regex.test(finding.secret));
    if (regexAllowed) return true;

    // Check global allowlist stopwords
    if (globalAllowlist.stopwords?.length) {
      const stopwordAllowed = globalAllowlist.stopwords.some((word) =>
        finding.secret.toLowerCase().includes(word.toLowerCase()),
      );
      if (stopwordAllowed) return true;
    }

    return false;
  }

  /**
   * Checks if a finding is allowed based on rule-specific allowlists.
   * Supports OR logic (any match allows) and AND logic (all specified checks must pass).
   */
  #checkFindingAllowed(
    finding: IFinding,
    sourceLocation: string,
    allowlists: IParsedGitleaksRuleAllowlist[],
  ): boolean {
    for (const allowlist of allowlists) {
      // Determine target based on regexTarget
      let target = finding.secret; // default
      if (allowlist.regexTarget === 'match') target = finding.match;
      if (allowlist.regexTarget === 'line') target = finding.line;

      const isAllowed =
        allowlist.condition === 'or'
          ? this.#checkAllowlistOr(allowlist, finding, sourceLocation, target)
          : this.#checkAllowlistAnd(allowlist, finding, sourceLocation, target);

      if (isAllowed) return true;
    }

    return false; // No allowlist matched
  }

  #checkAllowlistOr(
    allowlist: IParsedGitleaksRuleAllowlist,
    finding: IFinding,
    sourceLocation: string,
    target: string,
  ): boolean {
    // OR logic: any single match allows the finding
    if (allowlist.paths?.length && allowlist.paths.some((p) => p.test(sourceLocation))) {
      return true;
    }
    if (allowlist.regexes?.length && allowlist.regexes.some((r) => r.test(target))) {
      return true;
    }
    if (allowlist.stopwords?.length) {
      const lowerSecret = finding.secret.toLowerCase();
      if (allowlist.stopwords.some((sw) => lowerSecret.includes(sw.toLowerCase()))) {
        return true;
      }
    }
    return false;
  }

  #checkAllowlistAnd(
    allowlist: IParsedGitleaksRuleAllowlist,
    finding: IFinding,
    sourceLocation: string,
    target: string,
  ): boolean {
    // AND logic: all specified checks must pass
    const checks: boolean[] = [];

    if (allowlist.paths?.length) {
      checks.push(allowlist.paths.some((p) => p.test(sourceLocation)));
    }
    if (allowlist.regexes?.length) {
      checks.push(allowlist.regexes.some((r) => r.test(target)));
    }
    if (allowlist.stopwords?.length) {
      const lowerSecret = finding.secret.toLowerCase();
      checks.push(allowlist.stopwords.some((sw) => lowerSecret.includes(sw.toLowerCase())));
    }

    // All checks must pass for AND
    return checks.length > 0 && checks.every(Boolean);
  }
}
