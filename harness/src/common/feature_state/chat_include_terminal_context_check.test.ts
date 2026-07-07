import { Disposable } from '@gitlab-org/disposable';
import {
  ApiReconfiguredData,
  GitLabApiService,
  CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE,
} from '@gitlab-org/core';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DuoFeature, DuoFeatureAccessService } from '@gitlab-org/duo-feature-access';
import { DefaultChatIncludeTerminalContextCheck } from './chat_include_terminal_context_check';

describe('ChatIncludeTerminalContextCheck', () => {
  let disposables: Disposable[];

  let mockGitlabApiService: GitLabApiService;
  let mockDuoFeatureAccessService: DuoFeatureAccessService;

  type ApiReconfiguredListener = (data: ApiReconfiguredData) => void;
  let apiReconfiguredListeners: ApiReconfiguredListener[] = [];

  let chatIncludeTerminalContextCheck: DefaultChatIncludeTerminalContextCheck;

  const checkEngagedChangeListener = jest.fn();

  beforeEach(() => {
    apiReconfiguredListeners = [];
    disposables = [];

    mockGitlabApiService = createFakePartial<GitLabApiService>({
      onApiReconfigured: jest.fn((listener) => {
        apiReconfiguredListeners.push(listener);
        return { dispose: () => {} };
      }),
    });

    mockDuoFeatureAccessService = createFakePartial<DuoFeatureAccessService>({
      isChatFeatureEnabled: jest.fn(),
    });

    chatIncludeTerminalContextCheck = new DefaultChatIncludeTerminalContextCheck(
      mockDuoFeatureAccessService,
      mockGitlabApiService,
    );
    disposables.push(chatIncludeTerminalContextCheck.onChanged(checkEngagedChangeListener));
  });

  afterEach(() => {
    disposables.forEach((disposable) => disposable.dispose());
  });

  const reconfigureApi = async (
    data: ApiReconfiguredData = createFakePartial<ApiReconfiguredData>({ isInValidState: true }),
  ) => {
    apiReconfiguredListeners.forEach((listener) => listener(data));
    await new Promise(process.nextTick);
  };

  describe('initialization', () => {
    it('checks feature availability on init', async () => {
      jest.mocked(mockDuoFeatureAccessService.isChatFeatureEnabled).mockResolvedValueOnce(true);

      await chatIncludeTerminalContextCheck.init();

      expect(mockDuoFeatureAccessService.isChatFeatureEnabled).toHaveBeenCalledWith(
        DuoFeature.IncludeTerminalContext,
      );
      expect(chatIncludeTerminalContextCheck.engaged).toBe(false);
    });

    it('does not re-initialize if already initialized', async () => {
      jest.mocked(mockDuoFeatureAccessService.isChatFeatureEnabled).mockResolvedValueOnce(true);

      await chatIncludeTerminalContextCheck.init();
      await chatIncludeTerminalContextCheck.init(); // Call twice

      expect(mockDuoFeatureAccessService.isChatFeatureEnabled).toHaveBeenCalledTimes(1);
    });
  });

  describe('API configuration', () => {
    it('reinitializes when API is reconfigured', async () => {
      jest.mocked(mockDuoFeatureAccessService.isChatFeatureEnabled).mockResolvedValueOnce(true);

      await chatIncludeTerminalContextCheck.init();
      expect(mockDuoFeatureAccessService.isChatFeatureEnabled).toHaveBeenCalledTimes(1);

      jest.mocked(mockDuoFeatureAccessService.isChatFeatureEnabled).mockResolvedValueOnce(false);

      await reconfigureApi();
      expect(mockDuoFeatureAccessService.isChatFeatureEnabled).toHaveBeenCalledTimes(2);
    });
  });

  describe('engaged state', () => {
    it('should be engaged when terminal context is NOT enabled', async () => {
      jest.mocked(mockDuoFeatureAccessService.isChatFeatureEnabled).mockResolvedValueOnce(false);

      await chatIncludeTerminalContextCheck.init();

      expect(chatIncludeTerminalContextCheck.engaged).toBe(true);
    });

    it('should NOT be engaged when terminal context is enabled', async () => {
      jest.mocked(mockDuoFeatureAccessService.isChatFeatureEnabled).mockResolvedValueOnce(true);

      await chatIncludeTerminalContextCheck.init();

      expect(chatIncludeTerminalContextCheck.engaged).toBe(false);
    });

    it('emits change when terminal context state changes', async () => {
      jest.mocked(mockDuoFeatureAccessService.isChatFeatureEnabled).mockResolvedValueOnce(false);

      await chatIncludeTerminalContextCheck.init();
      expect(checkEngagedChangeListener).not.toHaveBeenCalled();

      jest.mocked(mockDuoFeatureAccessService.isChatFeatureEnabled).mockResolvedValueOnce(true);

      await reconfigureApi();

      expect(checkEngagedChangeListener).toHaveBeenCalledWith({
        checkId: CHAT_INCLUDE_TERMINAL_CONTEXT_UNAVAILABLE,
        engaged: false,
        details: chatIncludeTerminalContextCheck.details,
      });
    });

    it('does not emit change when terminal context state remains the same', async () => {
      jest.mocked(mockDuoFeatureAccessService.isChatFeatureEnabled).mockResolvedValueOnce(false);

      await chatIncludeTerminalContextCheck.init();
      expect(checkEngagedChangeListener).not.toHaveBeenCalled();

      jest.mocked(mockDuoFeatureAccessService.isChatFeatureEnabled).mockResolvedValueOnce(false);

      await reconfigureApi();

      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });
  });

  describe('dispose', () => {
    it('stops emitting events after disposal', async () => {
      jest.mocked(mockDuoFeatureAccessService.isChatFeatureEnabled).mockResolvedValueOnce(false);

      await chatIncludeTerminalContextCheck.init();
      checkEngagedChangeListener.mockClear();

      chatIncludeTerminalContextCheck.dispose();

      const disposable = chatIncludeTerminalContextCheck.onChanged(() => {});
      disposable.dispose();

      expect(checkEngagedChangeListener).not.toHaveBeenCalled();
    });
  });
});
