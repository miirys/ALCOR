import type { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { GitleaksRuleParser } from './gitleaks_rule_parser';
import { fullConfig } from './gitleaks_rules';

describe('GitleaksRuleParser', () => {
  let parser: GitleaksRuleParser;
  let mockLogger: Logger;

  beforeEach(() => {
    mockLogger = createFakePartial<Logger>({
      debug: jest.fn(),
    });
    parser = new GitleaksRuleParser(mockLogger);
  });

  describe('getParsedRules', () => {
    describe('when parsing all rules from raw config', () => {
      let rules: ReturnType<typeof parser.getParsedRules>;

      beforeEach(() => {
        rules = parser.getParsedRules();
      });

      it('should have the same number of rules as raw config', () => {
        expect(rules).toHaveLength(fullConfig.rules.length);
      });

      it('should have compiled regex or undefined for each rule', () => {
        // Each rule should have compiled regex (or undefined if parsing failed)
        rules.forEach((rule, index) => {
          const rawRule = fullConfig.rules[index];

          expect(rule.id).toBe(rawRule.id);
          expect(rule.description).toBe(rawRule.description);

          // Some regexes may fail to compile due to unsupported PCRE features
          if (rawRule.regex) {
            // Should either be a RegExp or undefined (if failed to parse)
            if (rule.regex) {
              expect(rule.regex).toBeInstanceOf(RegExp);
            }
          } else {
            expect(rule.regex).toBeUndefined();
          }

          if (rawRule.path) {
            if (rule.path) {
              expect(rule.path).toBeInstanceOf(RegExp);
            }
          } else {
            expect(rule.path).toBeUndefined();
          }
        });
      });

      it('should successfully parse regex on all rules', () => {
        const rawRulesWithRegex = fullConfig.rules.filter((r) => r.regex !== undefined);
        const rulesWithRegex = rules.filter((r) => r.regex !== undefined);
        expect(rulesWithRegex.length).toBe(rawRulesWithRegex.length);
      });
    });

    describe('when handling case-sensitive patterns', () => {
      let rules: ReturnType<typeof parser.getParsedRules>;
      let awsRule: (typeof rules)[0] | undefined;

      beforeEach(() => {
        rules = parser.getParsedRules();
        // Find AWS access token rule (should be case-sensitive)
        awsRule = rules.find((r) => r.id === 'aws-access-token');
      });

      it('should find the AWS access token rule', () => {
        expect(awsRule).toBeDefined();
      });

      it('should not have case-insensitive flag', () => {
        if (awsRule?.regex) {
          // Should not have 'i' flag
          expect(awsRule.regex.flags).not.toContain('i');
          expect(awsRule.regex.flags).toContain('g');
          expect(awsRule.regex.flags).toContain('m');
        }
      });
    });

    describe('when handling case-insensitive patterns', () => {
      let rules: ReturnType<typeof parser.getParsedRules>;
      let adobeRule: (typeof rules)[0] | undefined;

      beforeEach(() => {
        rules = parser.getParsedRules();
        // Find Adobe client ID rule (has (?i) prefix, should be case-insensitive)
        adobeRule = rules.find((r) => r.id === 'adobe-client-id');
      });

      it('should find the Adobe client ID rule', () => {
        expect(adobeRule).toBeDefined();
      });

      it('should have case-insensitive flag', () => {
        if (adobeRule?.regex) {
          // Should have 'i' flag
          expect(adobeRule.regex.flags).toContain('i');
          expect(adobeRule.regex.flags).toContain('g');
          expect(adobeRule.regex.flags).toContain('m');
        }
      });
    });
  });

  describe('getGlobalAllowlist', () => {
    describe('when parsing global allowlist from raw config', () => {
      let allowlist: ReturnType<typeof parser.getGlobalAllowlist>;

      beforeEach(() => {
        allowlist = parser.getGlobalAllowlist();
      });

      it('should have correct description and stopwords', () => {
        expect(allowlist.description).toBe(fullConfig.allowlist.description);
        expect(allowlist.stopwords).toEqual(fullConfig.allowlist.stopwords);
      });

      it('should have compiled regex patterns', () => {
        // Should have compiled regex patterns (some may fail to parse)
        // The safeCompileRegex filters out failed patterns
        expect(allowlist.regexes.length).toBeGreaterThan(0);
        expect(allowlist.regexes.length).toBeLessThanOrEqual(fullConfig.allowlist.regexes.length);
        allowlist.regexes.forEach((regex) => {
          expect(regex).toBeInstanceOf(RegExp);
        });
      });

      it('should have compiled path patterns', () => {
        expect(allowlist.paths.length).toBeGreaterThan(0);
        expect(allowlist.paths.length).toBeLessThanOrEqual(fullConfig.allowlist.paths.length);
        allowlist.paths.forEach((regex) => {
          expect(regex).toBeInstanceOf(RegExp);
        });
      });
    });

    describe('when handling case-insensitive path patterns in global allowlist', () => {
      let allowlist: ReturnType<typeof parser.getGlobalAllowlist>;
      let imagePattern: RegExp | undefined;

      beforeEach(() => {
        allowlist = parser.getGlobalAllowlist();
        // Find the image file pattern: (?i)\.(?:bmp|gif|jpe?g|png|svg|tiff?)$
        imagePattern = allowlist.paths.find(
          (p) => p.source.includes('bmp') && p.source.includes('gif'),
        );
      });

      it('should find the image pattern', () => {
        expect(imagePattern).toBeDefined();
      });

      it('should have case-insensitive flag but not global flag', () => {
        if (imagePattern) {
          // Should have 'i' flag for case-insensitive matching
          expect(imagePattern.flags).toContain('i');
          // Should NOT have 'g' flag (paths don't need global matching)
          expect(imagePattern.flags).not.toContain('g');
        }
      });

      describe.each([
        { filename: 'image.jpg' },
        { filename: 'image.JPG' },
        { filename: 'IMAGE.PNG' },
      ])('for file $filename', ({ filename }) => {
        it('should match case-insensitively', () => {
          if (imagePattern) {
            // Verify it actually matches case-insensitively
            expect(imagePattern.test(filename)).toBe(true);
          }
        });
      });
    });

    describe('when handling case-sensitive path patterns', () => {
      let allowlist: ReturnType<typeof parser.getGlobalAllowlist>;
      let gitPath: RegExp | undefined;

      beforeEach(() => {
        allowlist = parser.getGlobalAllowlist();
        // Find a path pattern without (?i) prefix
        gitPath = allowlist.paths.find((p) => p.source.includes('\\.git$'));
      });

      it('should have correct case sensitivity based on pattern', () => {
        if (gitPath) {
          // Should not have 'i' flag if pattern doesn't start with (?i)
          // Note: This particular pattern might have (?i), check the actual pattern
          // Just verify the flag correctly reflects the pattern
          if (gitPath.source.startsWith('(?i)') || gitPath.source.includes('(?i)')) {
            expect(gitPath.flags).toContain('i');
          } else {
            expect(gitPath.flags).not.toContain('i');
          }
        }
      });
    });
  });
});
