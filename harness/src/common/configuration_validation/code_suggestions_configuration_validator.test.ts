import { CODE_SUGGESTIONS } from '@gitlab-org/core';
import { CodeSuggestionsEnabledCheck } from '@gitlab-org/feature-state';
import {
  CodeSuggestionsDuoLicenseCheck,
  CodeSuggestionsInstanceVersionCheck,
  ProjectDuoAccessCheck,
} from '../feature_state';
import { DefaultCodeSuggestionsConfigurationValidator } from './code_suggestions_configuration_validator';

describe('CodeSuggestionsConfigurationValidator', () => {
  const config = {};

  let validateCodeSuggestionsInstanceVersionMock: jest.Mock;
  let codeSuggestionsInstanceVersionCheck: jest.Mocked<CodeSuggestionsInstanceVersionCheck>;

  let validateProjectDuoAccessMock: jest.Mock;
  let projectDuoAccessCheck: jest.Mocked<ProjectDuoAccessCheck>;

  let validateCodeSuggestionsDuoLicenseMock: jest.Mock;
  let codeSuggestionsDuoLicenseCheck: jest.Mocked<CodeSuggestionsDuoLicenseCheck>;

  let validateCodeSuggestionsEnabledMock: jest.Mock;
  let codeSuggestionsEnabledCheck: jest.Mocked<CodeSuggestionsEnabledCheck>;

  let validator: DefaultCodeSuggestionsConfigurationValidator;

  beforeEach(() => {
    validateCodeSuggestionsInstanceVersionMock = jest.fn();
    codeSuggestionsInstanceVersionCheck = {
      validate: validateCodeSuggestionsInstanceVersionMock,
    } as unknown as jest.Mocked<CodeSuggestionsInstanceVersionCheck>;

    validateProjectDuoAccessMock = jest.fn();
    projectDuoAccessCheck = {
      validate: validateProjectDuoAccessMock,
    } as unknown as jest.Mocked<ProjectDuoAccessCheck>;

    validateCodeSuggestionsDuoLicenseMock = jest.fn();
    codeSuggestionsDuoLicenseCheck = {
      validate: validateCodeSuggestionsDuoLicenseMock,
    } as unknown as jest.Mocked<CodeSuggestionsDuoLicenseCheck>;

    validateCodeSuggestionsEnabledMock = jest.fn();
    codeSuggestionsEnabledCheck = {
      validate: validateCodeSuggestionsEnabledMock,
    } as unknown as jest.Mocked<CodeSuggestionsEnabledCheck>;

    validator = new DefaultCodeSuggestionsConfigurationValidator(
      codeSuggestionsInstanceVersionCheck,
      projectDuoAccessCheck,
      codeSuggestionsDuoLicenseCheck,
      codeSuggestionsEnabledCheck,
    );
  });

  it('should include engaged checks in the response', async () => {
    jest
      .mocked(validateCodeSuggestionsInstanceVersionMock)
      .mockResolvedValue({ checkId: 'version-check', details: 'Version check', engaged: false });
    jest.mocked(validateProjectDuoAccessMock).mockResolvedValue({
      checkId: 'project-access-check',
      details: 'Project access check',
      engaged: false,
    });
    jest.mocked(validateCodeSuggestionsDuoLicenseMock).mockResolvedValue({
      checkId: 'no-duo-code-suggestions-license',
      details: 'License check',
      engaged: true,
    });
    jest.mocked(validateCodeSuggestionsEnabledMock).mockResolvedValue({
      checkId: 'suggestions-enabled-check',
      details: 'Suggestions enabled check',
      engaged: false,
    });

    const result = await validator.validate(config);

    expect(result?.featureId).toBe(CODE_SUGGESTIONS);
    expect(result?.engagedChecks).toHaveLength(1);
    expect(result?.engagedChecks?.[0].checkId).toBe('no-duo-code-suggestions-license');
    expect(result?.allChecks).toHaveLength(4);

    expect(validateCodeSuggestionsInstanceVersionMock).toHaveBeenCalledWith(config);
    expect(validateProjectDuoAccessMock).toHaveBeenCalledWith(config);
    expect(validateCodeSuggestionsDuoLicenseMock).toHaveBeenCalledWith(config);
    expect(validateCodeSuggestionsEnabledMock).toHaveBeenCalledWith(config);
  });
});
