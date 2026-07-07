import { createFakePartial } from '@gitlab-org/test-utils';
import {
  AUTHENTICATION,
  AUTHENTICATION_REQUIRED,
  CHAT,
  AGENTIC_CHAT,
  FLOWS,
  CHAT_DISABLED_BY_USER,
  CHAT_NO_LICENSE,
  CLASSIC_CHAT_NO_LICENSE,
  CODE_SUGGESTIONS,
  DUO_DISABLED_FOR_PROJECT,
  FeatureState,
  SUGGESTIONS_DISABLED_BY_USER,
  SUGGESTIONS_NO_LICENSE,
  UNSUPPORTED_GITLAB_VERSION,
  UNSUPPORTED_LANGUAGE,
  DISABLED_LANGUAGE,
  AUTHENTICATION_CHECK_PRIORITY_ORDERED,
  CODE_SUGGESTIONS_CHECKS_PRIORITY_ORDERED,
  CHAT_CHECKS_PRIORITY_ORDERED,
  SUGGESTIONS_API_ERROR,
  StateCheckId,
  CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE,
  AGENT_PLATFORM_DISABLED_BY_USER,
  AGENTIC_CHAT_CHECKS_PRIORITY_ORDERED,
  AGENTIC_CHAT_NO_SUPPORT,
  FLOWS_CHECKS_PRIORITY_ORDERED,
  FLOWS_INSTANCE_FLAG_DISABLED,
  SUGGESTIONS_FILE_EXCLUDED,
  SUGGESTIONS_NO_CREDITS,
  SUGGESTIONS_NO_DEFAULT_NAMESPACE,
  SANDBOX,
  SANDBOX_CHECKS_PRIORITY_ORDERED,
  SANDBOX_DISABLED_BY_USER,
  SANDBOX_UNSUPPORTED_PLATFORM,
  SANDBOX_MISSING_DEPENDENCIES,
  STATE_CHECK_USER_READABLE_LABELS,
  STATE_CHECK_DISABLED_LABELS,
} from '@gitlab-org/core';
import {
  AgentPlatformEnabledCheck,
  AuthenticationRequiredCheck,
  ChatEnabledCheck,
  CodeSuggestionsEnabledCheck,
  FlowsInstanceFlagCheck,
} from '@gitlab-org/feature-state';
import type {
  SandboxDisabledByUserCheck,
  SandboxUnsupportedPlatformCheck,
  SandboxMissingDependenciesCheck,
} from '@gitlab-org/sandbox/feature-state';
import { log } from '../log';
import { ChatIncludeTerminalContextCheck } from './chat_include_terminal_context_check';
import { DefaultFeatureStateManager } from './feature_state_manager';
import { CodeSuggestionsSupportedLanguageCheck } from './supported_language_check';
import { ProjectDuoAccessCheck } from './project_duo_acces_check';
import { CodeSuggestionsDuoLicenseCheck } from './code_suggestions_duo_license_check';
import { CodeSuggestionsInstanceVersionCheck } from './minimal_gitlab_version_for_code_suggestions_check';
import { DuoChatLicenseCheck } from './duo_chat_license_check';
import { SuggestionApiErrorCheck } from './suggestion_api_error_check';
import { AgenticChatSupportCheck } from './agentic_chat/agentic_chat_support_check';
import { CodeSuggestionsFileExclusionCheck } from './file_exclusion_check';
import { CodeSuggestionsCreditsCheck } from './code_suggestions_credits_check';
import { CodeSuggestionsMissingDefaultNamespaceCheck } from './code_suggestions_missing_default_namespace_check';
import { ClassicChatLicenseCheck } from './classic_chat_license_check';

jest.mock('../log');

describe('CodeSuggestionStateManager', () => {
  const mockSupportedLanguageCheckInit = jest.fn().mockResolvedValue({});
  const mockDuoProjectAccessCheckInit = jest.fn().mockResolvedValue({});
  const mockFileExclusionCheckInit = jest.fn().mockResolvedValue({});
  let languageCheckEngaged = true;
  let duoProjectAccessCheckEngaged = false;
  let authenticationRequiredCheckEngaged = false;
  let sandboxDisabledByUserCheckEngaged = false;

  const mockSendNotification = jest.fn();
  const checkChangeHandlers = new Map<StateCheckId, () => void | Promise<void>>();
  const createMockOnChanged = (checkId: StateCheckId) =>
    jest.fn().mockImplementation((callback: () => void) => {
      checkChangeHandlers.set(checkId, callback);
      return { dispose: jest.fn() };
    });

  let stateManager: DefaultFeatureStateManager;

  beforeEach(async () => {
    languageCheckEngaged = true;
    duoProjectAccessCheckEngaged = false;
    authenticationRequiredCheckEngaged = false;
    sandboxDisabledByUserCheckEngaged = false;

    const supportedLanguageCheck = createFakePartial<CodeSuggestionsSupportedLanguageCheck>({
      get engaged() {
        return languageCheckEngaged;
      },
      id: UNSUPPORTED_LANGUAGE,
      details: 'Language is not supported',
      onChanged: createMockOnChanged(UNSUPPORTED_LANGUAGE),
      init: mockSupportedLanguageCheckInit,
    });

    const suggestionApiErrorCheck = createFakePartial<SuggestionApiErrorCheck>({
      get engaged() {
        return false;
      },
      id: SUGGESTIONS_API_ERROR,
      details: 'Suggestion API Error Check',
      onChanged: createMockOnChanged(SUGGESTIONS_API_ERROR),
    });

    const duoProjectAccessCheck = createFakePartial<ProjectDuoAccessCheck>({
      get engaged() {
        return duoProjectAccessCheckEngaged;
      },
      id: DUO_DISABLED_FOR_PROJECT,
      details: 'DUO is disabled for this project.',
      onChanged: createMockOnChanged(DUO_DISABLED_FOR_PROJECT),
      init: mockDuoProjectAccessCheckInit,
    });

    const fileExclusionCheck = createFakePartial<CodeSuggestionsFileExclusionCheck>({
      get engaged() {
        return duoProjectAccessCheckEngaged;
      },
      id: SUGGESTIONS_FILE_EXCLUDED,
      details: 'File is excluded.',
      onChanged: createMockOnChanged(SUGGESTIONS_FILE_EXCLUDED),
      init: mockFileExclusionCheckInit,
    });

    const licenseAvailableCheck = createFakePartial<CodeSuggestionsDuoLicenseCheck>({
      get engaged() {
        return false;
      },
      id: SUGGESTIONS_NO_LICENSE,
      details: 'No license',
      onChanged: createMockOnChanged(SUGGESTIONS_NO_LICENSE),
    });

    const classicChatLicenseCheck = createFakePartial<ClassicChatLicenseCheck>({
      get engaged() {
        return false;
      },
      id: CLASSIC_CHAT_NO_LICENSE,
      details: 'No classic chat license',
      onChanged: createMockOnChanged(CLASSIC_CHAT_NO_LICENSE),
    });

    const chatLicenseAvailableCheck = createFakePartial<DuoChatLicenseCheck>({
      get engaged() {
        return false;
      },
      id: CHAT_NO_LICENSE,
      details: 'No chat license',
      onChanged: createMockOnChanged(CHAT_NO_LICENSE),
    });

    const minInstanceVersionCheck = createFakePartial<CodeSuggestionsInstanceVersionCheck>({
      get engaged() {
        return false;
      },
      id: UNSUPPORTED_GITLAB_VERSION,
      details: 'GitLab Duo Code Suggestions requires GitLab version 16.8 or later',
      onChanged: createMockOnChanged(UNSUPPORTED_GITLAB_VERSION),
    });

    const chatEnabledCheck = createFakePartial<ChatEnabledCheck>({
      get engaged() {
        return false;
      },
      id: CHAT_DISABLED_BY_USER,
      onChanged: createMockOnChanged(CHAT_DISABLED_BY_USER),
    });

    const chatIncludeTerminalContextCheck = createFakePartial<ChatIncludeTerminalContextCheck>({
      get engaged() {
        return false;
      },
      id: CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE,
      onChanged: createMockOnChanged(CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE),
    });

    const codeSuggestionEnabledCheck = createFakePartial<CodeSuggestionsEnabledCheck>({
      get engaged() {
        return false;
      },
      id: SUGGESTIONS_DISABLED_BY_USER,
      onChanged: createMockOnChanged(SUGGESTIONS_DISABLED_BY_USER),
    });

    const codeSuggestionsMissingDefaultNamespaceCheck =
      createFakePartial<CodeSuggestionsMissingDefaultNamespaceCheck>({
        get engaged() {
          return false;
        },
        id: SUGGESTIONS_NO_DEFAULT_NAMESPACE,
        onChanged: createMockOnChanged(SUGGESTIONS_NO_DEFAULT_NAMESPACE),
      });

    const codeSuggestionCreditCheck = createFakePartial<CodeSuggestionsCreditsCheck>({
      get engaged() {
        return false;
      },
      id: SUGGESTIONS_NO_CREDITS,
      onChanged: createMockOnChanged(SUGGESTIONS_NO_CREDITS),
    });

    const authenticationRequiredCheck = createFakePartial<AuthenticationRequiredCheck>({
      get engaged() {
        return authenticationRequiredCheckEngaged;
      },
      details: 'Authentication is required.',
      id: AUTHENTICATION_REQUIRED,
      onChanged: createMockOnChanged(AUTHENTICATION_REQUIRED),
    });

    const agentPlatformEnabledCheck = createFakePartial<AgentPlatformEnabledCheck>({
      get engaged() {
        return false;
      },
      id: AGENT_PLATFORM_DISABLED_BY_USER,
      onChanged: createMockOnChanged(AGENT_PLATFORM_DISABLED_BY_USER),
    });

    const agenticChatSupportedCheck = createFakePartial<AgenticChatSupportCheck>({
      get engaged() {
        return false;
      },
      id: AGENTIC_CHAT_NO_SUPPORT,
      onChanged: createMockOnChanged(AGENTIC_CHAT_NO_SUPPORT),
    });

    const flowsInstanceFlagCheck = createFakePartial<FlowsInstanceFlagCheck>({
      get engaged() {
        return false;
      },
      id: FLOWS_INSTANCE_FLAG_DISABLED,
      onChanged: createMockOnChanged(FLOWS_INSTANCE_FLAG_DISABLED),
    });

    const sandboxDisabledByUserCheck = createFakePartial<SandboxDisabledByUserCheck>({
      get engaged() {
        return sandboxDisabledByUserCheckEngaged;
      },
      id: SANDBOX_DISABLED_BY_USER,
      onChanged: createMockOnChanged(SANDBOX_DISABLED_BY_USER),
    });

    const sandboxUnsupportedPlatformCheck = createFakePartial<SandboxUnsupportedPlatformCheck>({
      get engaged() {
        return false;
      },
      id: SANDBOX_UNSUPPORTED_PLATFORM,
      onChanged: createMockOnChanged(SANDBOX_UNSUPPORTED_PLATFORM),
    });

    const sandboxMissingDependenciesCheck = createFakePartial<SandboxMissingDependenciesCheck>({
      get engaged() {
        return false;
      },
      id: SANDBOX_MISSING_DEPENDENCIES,
      context: {
        platform: 'macos',
        missingDependencies: [],
        providerVersion: '0.0.49',
      },
      onChanged: createMockOnChanged(SANDBOX_MISSING_DEPENDENCIES),
    });

    stateManager = new DefaultFeatureStateManager(
      suggestionApiErrorCheck,
      authenticationRequiredCheck,
      minInstanceVersionCheck,
      licenseAvailableCheck,
      duoProjectAccessCheck,
      fileExclusionCheck,
      supportedLanguageCheck,
      chatEnabledCheck,
      chatIncludeTerminalContextCheck,
      codeSuggestionEnabledCheck,
      codeSuggestionsMissingDefaultNamespaceCheck,
      codeSuggestionCreditCheck,
      classicChatLicenseCheck,
      chatLicenseAvailableCheck,
      agentPlatformEnabledCheck,
      agenticChatSupportedCheck,
      flowsInstanceFlagCheck,
      sandboxDisabledByUserCheck,
      sandboxUnsupportedPlatformCheck,
      sandboxMissingDependenciesCheck,
    );
    await stateManager.init(mockSendNotification);

    mockSendNotification.mockReset();
    jest.mocked(log.debug).mockReset();
  });

  describe('on init', () => {
    it('should initialize the checks and precompute sorted checks', () => {
      expect(mockDuoProjectAccessCheckInit).toHaveBeenCalled();
      expect(mockSupportedLanguageCheckInit).toHaveBeenCalled();
    });

    it('should not notify the client during init', async () => {
      const initNotify = jest.fn();
      const manager = new DefaultFeatureStateManager(
        createFakePartial<SuggestionApiErrorCheck>({
          get engaged() {
            return false;
          },
          id: SUGGESTIONS_API_ERROR,
          onChanged: createMockOnChanged(SUGGESTIONS_API_ERROR),
        }),
        createFakePartial<AuthenticationRequiredCheck>({
          get engaged() {
            return false;
          },
          id: AUTHENTICATION_REQUIRED,
          onChanged: createMockOnChanged(AUTHENTICATION_REQUIRED),
        }),
        createFakePartial<CodeSuggestionsInstanceVersionCheck>({
          get engaged() {
            return false;
          },
          id: UNSUPPORTED_GITLAB_VERSION,
          onChanged: createMockOnChanged(UNSUPPORTED_GITLAB_VERSION),
        }),
        createFakePartial<CodeSuggestionsDuoLicenseCheck>({
          get engaged() {
            return false;
          },
          id: SUGGESTIONS_NO_LICENSE,
          onChanged: createMockOnChanged(SUGGESTIONS_NO_LICENSE),
        }),
        createFakePartial<ProjectDuoAccessCheck>({
          get engaged() {
            return false;
          },
          id: DUO_DISABLED_FOR_PROJECT,
          onChanged: createMockOnChanged(DUO_DISABLED_FOR_PROJECT),
        }),
        createFakePartial<CodeSuggestionsFileExclusionCheck>({
          get engaged() {
            return false;
          },
          id: SUGGESTIONS_FILE_EXCLUDED,
          onChanged: createMockOnChanged(SUGGESTIONS_FILE_EXCLUDED),
        }),
        createFakePartial<CodeSuggestionsSupportedLanguageCheck>({
          get engaged() {
            return false;
          },
          id: UNSUPPORTED_LANGUAGE,
          onChanged: createMockOnChanged(UNSUPPORTED_LANGUAGE),
        }),
        createFakePartial<ChatEnabledCheck>({
          get engaged() {
            return false;
          },
          id: CHAT_DISABLED_BY_USER,
          onChanged: createMockOnChanged(CHAT_DISABLED_BY_USER),
        }),
        createFakePartial<ChatIncludeTerminalContextCheck>({
          get engaged() {
            return false;
          },
          id: CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE,
          onChanged: createMockOnChanged(CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE),
        }),
        createFakePartial<CodeSuggestionsEnabledCheck>({
          get engaged() {
            return false;
          },
          id: SUGGESTIONS_DISABLED_BY_USER,
          onChanged: createMockOnChanged(SUGGESTIONS_DISABLED_BY_USER),
        }),
        createFakePartial<CodeSuggestionsMissingDefaultNamespaceCheck>({
          get engaged() {
            return false;
          },
          id: SUGGESTIONS_NO_DEFAULT_NAMESPACE,
          onChanged: createMockOnChanged(SUGGESTIONS_NO_DEFAULT_NAMESPACE),
        }),
        createFakePartial<CodeSuggestionsCreditsCheck>({
          get engaged() {
            return false;
          },
          id: SUGGESTIONS_NO_CREDITS,
          onChanged: createMockOnChanged(SUGGESTIONS_NO_CREDITS),
        }),
        createFakePartial<ClassicChatLicenseCheck>({
          get engaged() {
            return false;
          },
          id: CLASSIC_CHAT_NO_LICENSE,
          onChanged: createMockOnChanged(CLASSIC_CHAT_NO_LICENSE),
        }),
        createFakePartial<DuoChatLicenseCheck>({
          get engaged() {
            return false;
          },
          id: CHAT_NO_LICENSE,
          onChanged: createMockOnChanged(CHAT_NO_LICENSE),
        }),
        createFakePartial<AgentPlatformEnabledCheck>({
          get engaged() {
            return false;
          },
          id: AGENT_PLATFORM_DISABLED_BY_USER,
          onChanged: createMockOnChanged(AGENT_PLATFORM_DISABLED_BY_USER),
        }),
        createFakePartial<AgenticChatSupportCheck>({
          get engaged() {
            return false;
          },
          id: AGENTIC_CHAT_NO_SUPPORT,
          onChanged: createMockOnChanged(AGENTIC_CHAT_NO_SUPPORT),
        }),
        createFakePartial<FlowsInstanceFlagCheck>({
          get engaged() {
            return false;
          },
          id: FLOWS_INSTANCE_FLAG_DISABLED,
          onChanged: createMockOnChanged(FLOWS_INSTANCE_FLAG_DISABLED),
        }),
        createFakePartial<SandboxDisabledByUserCheck>({
          get engaged() {
            return false;
          },
          id: SANDBOX_DISABLED_BY_USER,
          onChanged: createMockOnChanged(SANDBOX_DISABLED_BY_USER),
        }),
        createFakePartial<SandboxUnsupportedPlatformCheck>({
          get engaged() {
            return false;
          },
          id: SANDBOX_UNSUPPORTED_PLATFORM,
          onChanged: createMockOnChanged(SANDBOX_UNSUPPORTED_PLATFORM),
        }),
        createFakePartial<SandboxMissingDependenciesCheck>({
          get engaged() {
            return false;
          },
          id: SANDBOX_MISSING_DEPENDENCIES,
          onChanged: createMockOnChanged(SANDBOX_MISSING_DEPENDENCIES),
        }),
      );

      await manager.init(initNotify);

      expect(initNotify).not.toHaveBeenCalled();
    });

    it('should use the default values for unchanged checks', async () => {
      // AUTHENTICATION_REQUIRED starts disengaged; engaging it produces a real state change.
      // We then assert that UNSUPPORTED_LANGUAGE (which hasn't changed) is still reflected
      // correctly in the notification using its default engaged value.
      authenticationRequiredCheckEngaged = true;
      await checkChangeHandlers.get(AUTHENTICATION_REQUIRED)?.();

      const allChecks: FeatureState[] = mockSendNotification.mock.calls[0][0];
      const codeSuggestionsChecks = allChecks.find(
        ({ featureId }) => featureId === CODE_SUGGESTIONS,
      );
      expect(
        codeSuggestionsChecks?.engagedChecks.some((c) => c.checkId === UNSUPPORTED_LANGUAGE),
      ).toBe(true);
    });
  });

  describe('diff deduplication', () => {
    it('should not notify the client when the state has not changed', async () => {
      // SUGGESTIONS_NO_LICENSE starts disengaged; firing its handler without changing engaged state
      // produces an identical state, so no notification should be sent
      await checkChangeHandlers.get(SUGGESTIONS_NO_LICENSE)?.();

      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(log.debug).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('should stop notifications after dispose', async () => {
      stateManager.dispose();

      authenticationRequiredCheckEngaged = true;
      await checkChangeHandlers.get(AUTHENTICATION_REQUIRED)?.();

      expect(mockSendNotification).not.toHaveBeenCalled();
      expect(log.debug).not.toHaveBeenCalled();
    });
  });

  describe('on check engage', () => {
    it('should update engaged checks set and notify the client', async () => {
      // AUTHENTICATION_REQUIRED starts disengaged; engaging it produces a real state change
      authenticationRequiredCheckEngaged = true;

      const mockChecksEngagedState = createFakePartial<FeatureState>({
        featureId: CODE_SUGGESTIONS,
        engagedChecks: [
          {
            checkId: AUTHENTICATION_REQUIRED,
            label: STATE_CHECK_USER_READABLE_LABELS[AUTHENTICATION_REQUIRED],
            disabledLabel: STATE_CHECK_DISABLED_LABELS[AUTHENTICATION_REQUIRED],
            details: 'Authentication is required.',
            engaged: true,
          },
          {
            checkId: UNSUPPORTED_LANGUAGE,
            label: STATE_CHECK_USER_READABLE_LABELS[UNSUPPORTED_LANGUAGE],
            disabledLabel: STATE_CHECK_DISABLED_LABELS[UNSUPPORTED_LANGUAGE],
            details: 'Language is not supported',
            engaged: true,
          },
        ],
        allChecks: expect.any(Array),
      });

      const handler = checkChangeHandlers.get(AUTHENTICATION_REQUIRED);
      if (handler) {
        await handler();
      }

      const allChecks: FeatureState[] = mockSendNotification.mock.calls[0][0];
      const codeSuggestionsChecks = allChecks.find(
        ({ featureId }) => featureId === CODE_SUGGESTIONS,
      );

      expect(codeSuggestionsChecks).toEqual(mockChecksEngagedState);
      expect(mockSendNotification).toHaveBeenCalled();
      expect(log.debug).toHaveBeenCalledWith(
        expect.stringContaining('Feature state changed, notifying client'),
      );
    });
  });

  describe('sandbox feature wiring', () => {
    it('surfaces the SANDBOX feature with checks in priority order', () => {
      let emitted: FeatureState[] | undefined;
      stateManager.onChange((state) => {
        emitted = state;
      });

      const sandboxFeature = emitted?.find(({ featureId }) => featureId === SANDBOX);

      expect(sandboxFeature).toBeDefined();
      expect(sandboxFeature?.allChecks.map((c) => c.checkId)).toEqual(
        SANDBOX_CHECKS_PRIORITY_ORDERED,
      );
    });

    it('surfaces SANDBOX_DISABLED_BY_USER engagement in the payload', async () => {
      sandboxDisabledByUserCheckEngaged = true;

      await checkChangeHandlers.get(SANDBOX_DISABLED_BY_USER)?.();

      const allChecks: FeatureState[] = mockSendNotification.mock.calls[0][0];
      const sandboxFeature = allChecks.find(({ featureId }) => featureId === SANDBOX);

      expect(sandboxFeature?.engagedChecks.map((c) => c.checkId)).toEqual([
        SANDBOX_DISABLED_BY_USER,
      ]);
    });

    it('round-trips the sandbox diagnostic context through allChecks', () => {
      let emitted: FeatureState[] | undefined;
      stateManager.onChange((state) => {
        emitted = state;
      });

      const sandboxFeature = emitted?.find(({ featureId }) => featureId === SANDBOX);
      const depsCheck = sandboxFeature?.allChecks.find(
        (c) => c.checkId === SANDBOX_MISSING_DEPENDENCIES,
      );

      expect(depsCheck?.context).toEqual({
        platform: 'macos',
        missingDependencies: [],
        providerVersion: '0.0.49',
      });
    });
  });

  describe('on check disengage', () => {
    it('should update engaged checks set and notify the client', async () => {
      // UNSUPPORTED_LANGUAGE starts engaged; disengaging it produces a real state change
      languageCheckEngaged = false;

      const mockChecksEngagedState = createFakePartial<FeatureState>({
        featureId: CODE_SUGGESTIONS,
        engagedChecks: [],
        allChecks: expect.any(Array),
      });

      const handler = checkChangeHandlers.get(UNSUPPORTED_LANGUAGE);
      if (handler) {
        await handler();
      }

      const allChecks: FeatureState[] = mockSendNotification.mock.calls[0][0];
      const codeSuggestionsChecks = allChecks.find(
        ({ featureId }) => featureId === CODE_SUGGESTIONS,
      );

      expect(codeSuggestionsChecks).toEqual(mockChecksEngagedState);
      expect(log.debug).toHaveBeenCalledWith(
        expect.stringContaining('Feature state changed, notifying client'),
      );
    });
  });

  describe('onChange', () => {
    it('should emit initial state to new listeners immediately', () => {
      const mockListener = jest.fn();

      stateManager.onChange(mockListener);

      expect(mockListener).toHaveBeenCalled();
    });

    it('should emit state changes to onChange listeners', async () => {
      const mockListener = jest.fn();

      stateManager.onChange(mockListener);
      mockListener.mockClear();

      languageCheckEngaged = false;

      const handler = checkChangeHandlers.get(UNSUPPORTED_LANGUAGE);
      if (handler) {
        await handler();
      }

      expect(mockListener).toHaveBeenCalledTimes(1);
    });

    it('should support multiple onChange listeners', async () => {
      const mockListener1 = jest.fn();
      const mockListener2 = jest.fn();

      stateManager.onChange(mockListener1);
      stateManager.onChange(mockListener2);

      expect(mockListener1).toHaveBeenCalledTimes(1);
      expect(mockListener2).toHaveBeenCalledTimes(1);

      mockListener1.mockClear();
      mockListener2.mockClear();

      const handler = checkChangeHandlers.get(UNSUPPORTED_LANGUAGE);
      if (handler) {
        await handler();
      }

      expect(mockListener1).toHaveBeenCalledTimes(1);
      expect(mockListener2).toHaveBeenCalledTimes(1);
      expect(mockListener1.mock.calls[0][0]).toEqual(mockListener2.mock.calls[0][0]);
    });
  });

  describe('checks order', () => {
    beforeEach(() => {
      authenticationRequiredCheckEngaged = true;
      languageCheckEngaged = true;
      duoProjectAccessCheckEngaged = true;
    });

    it('should sort ENGAGED checks in correct order', async () => {
      await checkChangeHandlers.get(AUTHENTICATION_REQUIRED)?.();
      await checkChangeHandlers.get(UNSUPPORTED_LANGUAGE)?.();
      await checkChangeHandlers.get(DUO_DISABLED_FOR_PROJECT)?.();

      const lastCallIndex = mockSendNotification.mock.calls.length - 1;
      const allChecks: FeatureState[] = mockSendNotification.mock.calls[lastCallIndex][0];
      const authenticationChecks = allChecks.find(({ featureId }) => featureId === AUTHENTICATION);
      const authChecksOrderedIds = authenticationChecks?.engagedChecks?.map(
        ({ checkId }) => checkId,
      );
      // Check that AUTHENTICATION checks are correctly ordered
      expect(authChecksOrderedIds).toEqual(AUTHENTICATION_CHECK_PRIORITY_ORDERED);

      const codeSuggestionsChecks = allChecks.find(
        ({ featureId }) => featureId === CODE_SUGGESTIONS,
      );
      const codeSuggestionsChecksIds = codeSuggestionsChecks?.engagedChecks?.map(
        ({ checkId }) => checkId,
      );

      // Check that CODE_SUGGESTIONS are correctly ordered
      expect(codeSuggestionsChecksIds).toEqual([
        AUTHENTICATION_REQUIRED,
        DUO_DISABLED_FOR_PROJECT,
        UNSUPPORTED_LANGUAGE,
      ]);

      // Check that CHAT are correctly ordered
      const chatChecks = allChecks.find(({ featureId }) => featureId === CHAT);
      const chatChecksIds = chatChecks?.engagedChecks?.map(({ checkId }) => checkId);
      expect(chatChecksIds).toEqual([AUTHENTICATION_REQUIRED, DUO_DISABLED_FOR_PROJECT]);
    });

    it('should sort ALL checks in correct order', async () => {
      await checkChangeHandlers.get(DUO_DISABLED_FOR_PROJECT)?.();

      const lastCallIndex = mockSendNotification.mock.calls.length - 1;
      const allChecks: FeatureState[] = mockSendNotification.mock.calls[lastCallIndex][0];
      const authenticationChecks = allChecks.find(({ featureId }) => featureId === AUTHENTICATION);
      const authChecksOrderedIds = authenticationChecks?.allChecks?.map(({ checkId }) => checkId);

      expect(authChecksOrderedIds).toEqual(AUTHENTICATION_CHECK_PRIORITY_ORDERED);

      // Check that CODE_SUGGESTIONS are correctly ordered
      const codeSuggestionsChecks = allChecks.find(
        ({ featureId }) => featureId === CODE_SUGGESTIONS,
      );
      const codeSuggestionsChecksIds = codeSuggestionsChecks?.allChecks?.map(
        ({ checkId }) => checkId,
      );
      // we filter out DISABLED_LANGUAGE because it is the same policy as UNSUPPORTED_LANGUAGE
      expect(codeSuggestionsChecksIds).toEqual(
        CODE_SUGGESTIONS_CHECKS_PRIORITY_ORDERED.filter((check) => check !== DISABLED_LANGUAGE),
      );

      // Check that CHAT are correctly ordered
      const chatChecks = allChecks.find(({ featureId }) => featureId === CHAT);
      const chatChecksIds = chatChecks?.allChecks?.map(({ checkId }) => checkId);
      expect(chatChecksIds).toEqual(CHAT_CHECKS_PRIORITY_ORDERED);

      // Check that AGENTIC_CHAT checks are correctly ordered
      const agenticChatChecks = allChecks.find(({ featureId }) => featureId === AGENTIC_CHAT);
      const agenticChatChecksIds = agenticChatChecks?.allChecks?.map(({ checkId }) => checkId);
      expect(agenticChatChecksIds).toEqual(AGENTIC_CHAT_CHECKS_PRIORITY_ORDERED);

      // Check that FLOWS checks are correctly ordered
      const flowsChecks = allChecks.find(({ featureId }) => featureId === FLOWS);
      const flowsChecksIds = flowsChecks?.allChecks?.map(({ checkId }) => checkId);
      expect(flowsChecksIds).toEqual(FLOWS_CHECKS_PRIORITY_ORDERED);
    });
  });
});
