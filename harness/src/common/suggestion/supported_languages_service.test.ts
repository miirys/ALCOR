import { TestLogger } from '@gitlab-org/logging';
import { ConfigService, DefaultConfigService } from '@gitlab-org/config';
import {
  BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES,
  DefaultSupportedLanguagesService,
} from './supported_languages_service';

describe('SupportedLanguages', () => {
  let testLogger: TestLogger;
  let configService: ConfigService;
  let supportedLanguages: DefaultSupportedLanguagesService;

  beforeEach(() => {
    configService = new DefaultConfigService();
    testLogger = new TestLogger();
    supportedLanguages = new DefaultSupportedLanguagesService(configService, testLogger);
  });

  describe('constructor', () => {
    it('should initialize enabled languages with the default supported languages', () => {
      expect(supportedLanguages.isLanguageEnabled('some-random-language')).toBe(false);

      for (const lang of BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES) {
        expect(supportedLanguages.isLanguageEnabled(lang)).toBe(true);
      }
    });

    it('should initialize supported languages', () => {
      expect(supportedLanguages.isLanguageSupported('some-random-language')).toBe(false);

      for (const lang of BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES) {
        expect(supportedLanguages.isLanguageSupported(lang)).toBe(true);
      }
    });

    it('should log an info message about the supported languages', () => {
      const { message } = testLogger.infoLogs[0];
      expect(message).toMatch(/Enabling the default Code Suggestions languages/);
      expect(message).toMatch(/java/);
      expect(message).toMatch(/csharp/);
    });
  });

  describe('update', () => {
    it('should enable languages passed to "allow"', () => {
      const newLanguages = ['python', 'java', 'some-random-language'];
      configService.set('codeCompletion.additionalLanguages', newLanguages);

      for (const lang of newLanguages) {
        expect(supportedLanguages.isLanguageEnabled(lang)).toBe(true);
      }

      for (const lang of BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES) {
        expect(supportedLanguages.isLanguageEnabled(lang)).toBe(true);
      }
    });

    it('should disable languages passed to "deny"', () => {
      const disableLanguages = ['python', 'java', 'some-random-language'];
      configService.set('codeCompletion.disabledSupportedLanguages', disableLanguages);

      for (const disabledLanguage of disableLanguages) {
        expect(supportedLanguages.isLanguageEnabled(disabledLanguage)).toBe(false);
      }

      const remainingSupportedLanguages = BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES.filter(
        (lang) => !disableLanguages.includes(lang),
      );

      expect(remainingSupportedLanguages.length).toBeGreaterThan(0);

      for (const lang of remainingSupportedLanguages) {
        expect(supportedLanguages.isLanguageEnabled(lang)).toBe(true);
      }
    });

    it('should not support languages listed in both "allow" and "deny"', () => {
      const allowAndDenyLanguages = ['python', 'java', 'some-random-language'];
      configService.set('codeCompletion.additionalLanguages', allowAndDenyLanguages);
      configService.set('codeCompletion.disabledSupportedLanguages', allowAndDenyLanguages);

      for (const disabledLanguage of allowAndDenyLanguages) {
        expect(supportedLanguages.isLanguageEnabled(disabledLanguage)).toBe(false);
      }

      const remainingSupportedLanguages = BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES.filter(
        (lang) => !allowAndDenyLanguages.includes(lang),
      );

      expect(remainingSupportedLanguages.length).toBeGreaterThan(0);

      for (const lang of remainingSupportedLanguages) {
        expect(supportedLanguages.isLanguageEnabled(lang)).toBe(true);
      }
    });

    it('should emit event when updating languages', () => {
      const listener = jest.fn(() => {
        // Make sure event is emitted after (not before) service is updated
        expect(supportedLanguages.isLanguageEnabled('clojure')).toBe(true);
      });

      supportedLanguages.onLanguageChange(listener);

      configService.set('codeCompletion.additionalLanguages', ['clojure']);

      expect(listener).toHaveBeenCalled();
    });

    it('should not emit event when updating languages is a no-op', () => {
      const listener = jest.fn();
      supportedLanguages.onLanguageChange(listener);

      configService.set('codeCompletion.additionalLanguages', ['python']);
      configService.set('codeCompletion.disabledSupportedLanguages', ['some-random-language']);

      expect(listener).not.toHaveBeenCalled();
    });

    describe('when normalizing "additionalLanguages" language identifiers', () => {
      it.each([
        { value: 'COOL-LANG', expected: 'cool-lang' },
        { value: '.cool-lang', expected: 'cool-lang' },
        { value: ' cool-lang', expected: 'cool-lang' },
        { value: ' cool-lang ', expected: 'cool-lang' },
        { value: ' .cOOL-LanG ', expected: 'cool-lang' },
      ])('"$value" becomes "$expected"', ({ value, expected }) => {
        configService.set('codeCompletion.additionalLanguages', [value]);

        expect(supportedLanguages.isLanguageEnabled(expected)).toBe(true);
      });
    });

    it('should should log list of currently enabled languages', () => {
      testLogger.clear();
      configService.merge({
        codeCompletion: {
          additionalLanguages: ['clojure'],
          disabledSupportedLanguages: ['handlebars'],
        },
      });
      expect(testLogger.nonDebugLogs).toHaveLength(1);
      const { message } = testLogger.infoLogs[0];
      expect(message).toMatch(/languages have changed/);
      expect(message).toMatch(/clojure/);
      expect(message).not.toMatch(/handlebars/);
    });
  });

  describe('isLanguageEnabled', () => {
    it('should return true if the language is supported', () => {
      expect(supportedLanguages.isLanguageEnabled('python')).toBe(true);
      expect(supportedLanguages.isLanguageEnabled('java')).toBe(true);
    });

    it('should return false if the language is not supported', () => {
      expect(supportedLanguages.isLanguageEnabled('unsupported')).toBe(false);
    });
  });

  describe('getLanguageForFile', () => {
    it('should return the language name for a given file', () => {
      const result = DefaultSupportedLanguagesService.getLanguageForFile('test.ts');
      expect(result).toBe('typescript');
    });

    it('should return "undefined" when no language identifier matched file extension', () => {
      const result = DefaultSupportedLanguagesService.getLanguageForFile('test.txt');
      expect(result).toBeUndefined();
    });
  });
});
