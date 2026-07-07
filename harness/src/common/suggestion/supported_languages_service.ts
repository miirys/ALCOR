import EventEmitter from 'events';
import { isEqual } from 'lodash';
import { Disposable } from 'vscode-languageserver-protocol';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { ConfigService } from '@gitlab-org/config';
import { supportedLanguages } from '../code_suggestions_config';

export const BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES = supportedLanguages.map(
  (l) => l.languageId,
);

const EXTENSION_TO_LANG_MAP = (() => {
  const extensionToLanguageMap = new Map<string, string>();

  supportedLanguages.forEach((language) => {
    language.fileExtensions.forEach((extension) => {
      extensionToLanguageMap.set(extension, language.languageId);
    });
  });

  return extensionToLanguageMap;
})();

interface SupportedLanguagesUpdateParam {
  allow?: string[];
  deny?: string[];
}

export interface SupportedLanguagesService {
  isLanguageEnabled(languageId: string): boolean;
  isLanguageSupported(languageId: string): boolean;
  onLanguageChange(listener: () => void): Disposable;
}

export const SupportedLanguagesService = createInterfaceId<SupportedLanguagesService>(
  'SupportedLanguagesService',
);

@Injectable(SupportedLanguagesService, [ConfigService, Logger])
export class DefaultSupportedLanguagesService implements SupportedLanguagesService {
  #enabledLanguages: Set<string>;

  readonly #supportedLanguages: Set<string>;

  #configService: ConfigService;

  #eventEmitter = new EventEmitter();

  #logger: Logger;

  constructor(configService: ConfigService, logger: Logger) {
    this.#enabledLanguages = new Set(BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES);
    this.#supportedLanguages = new Set(BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES);
    this.#configService = configService;
    this.#configService.onConfigChange(() => this.#update());
    this.#logger = withPrefix(logger, '[SupportedLanguageService]');
    this.#logger.info(
      `Initialized. Enabling the default Code Suggestions languages: ${this.#enabledLanguagesString}`,
    );
  }

  #getConfiguredLanguages() {
    const languages: SupportedLanguagesUpdateParam = {};

    const additionalLanguages = this.#configService.get('codeCompletion.additionalLanguages');

    languages.allow =
      additionalLanguages && additionalLanguages.map(this.#normalizeLanguageIdentifier);

    const disabledSupportedLanguages = this.#configService.get(
      'codeCompletion.disabledSupportedLanguages',
    );

    languages.deny = disabledSupportedLanguages;

    return languages;
  }

  #update() {
    const { allow = [], deny = [] } = this.#getConfiguredLanguages();
    const newSet: Set<string> = new Set(BASE_SUPPORTED_CODE_SUGGESTIONS_LANGUAGES);

    for (const language of allow) {
      newSet.add(language.trim());
    }

    for (const language of deny) {
      newSet.delete(language);
    }

    if (newSet.size === 0) {
      this.#logger.warn('All languages have been disabled for Code Suggestions.');
    }

    const previousEnabledLanguages = this.#enabledLanguages;
    this.#enabledLanguages = newSet;

    if (!isEqual(previousEnabledLanguages, this.#enabledLanguages)) {
      this.#logger.info(
        `Code Suggestions enabled languages have changed. The currently enabled languages are: ${this.#enabledLanguagesString}`,
      );
      this.#triggerChange();
    }
  }

  isLanguageSupported(languageId: string) {
    return this.#supportedLanguages.has(languageId);
  }

  isLanguageEnabled(languageId: string) {
    return this.#enabledLanguages.has(languageId);
  }

  onLanguageChange(listener: () => void): Disposable {
    this.#eventEmitter.on('languageChange', listener);
    return { dispose: () => this.#eventEmitter.removeListener('configChange', listener) };
  }

  #triggerChange() {
    this.#eventEmitter.emit('languageChange');
  }

  #normalizeLanguageIdentifier(language: string) {
    return language.trim().toLowerCase().replace(/^\./, '');
  }

  get #enabledLanguagesString() {
    return Array.from(this.#enabledLanguages).join(',');
  }

  static getLanguageForFile(filename?: string): string | undefined {
    const ext = filename?.split('.').pop();
    return EXTENSION_TO_LANG_MAP.get(`.${ext}`);
  }
}
