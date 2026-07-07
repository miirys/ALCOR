import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { DuoFeatureAccessService, DuoFeature } from '@gitlab-org/duo-feature-access';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import type { AIContextItem } from '../index';

import { DefaultSystemContextManager } from './system_context_manager';
import { SystemContextProvider } from './system_context_provider';

describe('DefaultSystemContextManager', () => {
  let systemContextManager: DefaultSystemContextManager;
  let testLogger: TestLogger;
  let mockDuoFeatureAccessService: DuoFeatureAccessService;
  let mockSecretRedactor: SecretRedactor;

  beforeEach(() => {
    testLogger = new TestLogger();

    mockDuoFeatureAccessService = createFakePartial<DuoFeatureAccessService>({
      isChatFeatureEnabled: jest.fn(),
    });

    mockSecretRedactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest.fn((raw: string) => raw),
    });
  });

  describe('getSystemContextItems', () => {
    it('should retrieve context items from enabled providers only', async () => {
      const mockProvider1 = createFakePartial<SystemContextProvider>({
        chatRequiredFeature: DuoFeature.IncludeUserRule,
        getItems: jest.fn(),
      });

      const mockProvider2 = createFakePartial<SystemContextProvider>({
        chatRequiredFeature: DuoFeature.IncludeIssueContext,
        getItems: jest.fn(),
      });

      const mockProvider3 = createFakePartial<SystemContextProvider>({
        getItems: jest.fn(),
      });

      const contextItems1: AIContextItem[] = [createFakePartial<AIContextItem>({ id: 'item-1' })];
      const contextItems3: AIContextItem[] = [createFakePartial<AIContextItem>({ id: 'item-3' })];

      jest
        .mocked(mockDuoFeatureAccessService.isChatFeatureEnabled)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(false);

      jest.mocked(mockProvider1.getItems).mockResolvedValue(contextItems1);
      jest.mocked(mockProvider3.getItems).mockResolvedValue(contextItems3);

      systemContextManager = new DefaultSystemContextManager(
        testLogger,
        [mockProvider1, mockProvider2, mockProvider3],
        mockDuoFeatureAccessService,
        mockSecretRedactor,
      );

      const result = await systemContextManager.getSystemContextItems();

      expect(result).toEqual([...contextItems1, ...contextItems3]);
      expect(mockProvider1.getItems).toHaveBeenCalledTimes(1);
      expect(mockProvider2.getItems).not.toHaveBeenCalled();
      expect(mockProvider3.getItems).toHaveBeenCalledTimes(1);
      expect(mockDuoFeatureAccessService.isChatFeatureEnabled).toHaveBeenCalledTimes(2);

      expect(testLogger.infoLogs[0].message).toContain(
        '[getSystemContextItems] running for 2 providers',
      );
      expect(testLogger.infoLogs[testLogger.infoLogs.length - 1].message).toBe(
        '[SystemContextManager] Retrieved 2 system context items',
      );

      const debugMessages = testLogger.debugLogs.map((log) => log.message);
      expect(debugMessages).toHaveLength(3);
      expect(debugMessages).toContain(
        '[SystemContextManager] System provider with required feature "include_user_rule_context": true',
      );
      expect(debugMessages).toContain(
        '[SystemContextManager] System provider with required feature "include_issue_context": false',
      );
      expect(debugMessages).toContain(
        '[SystemContextManager] System provider has no feature requirement, enabled by default',
      );
    });

    it('redacts secrets from item content before returning', async () => {
      const provider = createFakePartial<SystemContextProvider>({
        getItems: jest.fn(),
      });

      const items: AIContextItem[] = [
        createFakePartial<AIContextItem>({ id: 'item-1', content: 'token glpat-SECRET' }),
        createFakePartial<AIContextItem>({ id: 'item-2', content: undefined }),
      ];
      jest.mocked(provider.getItems).mockResolvedValue(items);
      jest.mocked(mockSecretRedactor.redactSecrets).mockReturnValue('token [REDACTED]');

      systemContextManager = new DefaultSystemContextManager(
        testLogger,
        [provider],
        mockDuoFeatureAccessService,
        mockSecretRedactor,
      );

      const result = await systemContextManager.getSystemContextItems();

      expect(mockSecretRedactor.redactSecrets).toHaveBeenCalledTimes(1);
      expect(mockSecretRedactor.redactSecrets).toHaveBeenCalledWith('token glpat-SECRET', 'item-1');
      expect(result[0].content).toBe('token [REDACTED]');
      expect(result[1].content).toBeUndefined();
    });

    it('strips content when redaction throws', async () => {
      const provider = createFakePartial<SystemContextProvider>({
        getItems: jest.fn(),
      });

      const items: AIContextItem[] = [
        createFakePartial<AIContextItem>({ id: 'item-1', content: 'token glpat-SECRET' }),
      ];
      jest.mocked(provider.getItems).mockResolvedValue(items);
      jest.mocked(mockSecretRedactor.redactSecrets).mockImplementation(() => {
        throw new Error('redaction failed');
      });

      systemContextManager = new DefaultSystemContextManager(
        testLogger,
        [provider],
        mockDuoFeatureAccessService,
        mockSecretRedactor,
      );

      const result = await systemContextManager.getSystemContextItems();

      expect(result[0].content).toBeUndefined();
      expect(testLogger.errorLogs[0].message).toBe(
        '[SystemContextManager] Error redacting system context item "item-1". Item content will be excluded.',
      );
    });
  });

  describe('precalculateOnInitialized', () => {
    it('calls precalculate on all providers regardless of feature flags', async () => {
      const mockInitProvider = createFakePartial<SystemContextProvider>({
        chatRequiredFeature: DuoFeature.IncludeUserRule,
        getItems: jest.fn(),
        precalculate: jest.fn(),
      });

      const mockWorkflowProvider = createFakePartial<SystemContextProvider>({
        chatRequiredFeature: DuoFeature.IncludeIssueContext,
        precalculateOnWorkflowStart: jest.fn(),
        getItems: jest.fn(),
        precalculate: jest.fn(),
      });

      jest.mocked(mockInitProvider.precalculate!).mockResolvedValue();
      jest.mocked(mockWorkflowProvider.precalculate!).mockResolvedValue();

      systemContextManager = new DefaultSystemContextManager(
        testLogger,
        [mockInitProvider, mockWorkflowProvider],
        mockDuoFeatureAccessService,
        mockSecretRedactor,
      );

      await systemContextManager.precalculateOnInitialized();

      expect(mockDuoFeatureAccessService.isChatFeatureEnabled).not.toHaveBeenCalled();
      expect(mockInitProvider.precalculate).toHaveBeenCalledTimes(1);
      expect(mockWorkflowProvider.precalculate).toHaveBeenCalledTimes(1);

      expect(testLogger.infoLogs[0].message).toContain(
        '[precalculateOnInitialized] running for 2 providers',
      );
      expect(testLogger.infoLogs[testLogger.infoLogs.length - 1].message).toBe(
        '[SystemContextManager] System context precalculation complete for initialized',
      );
    });

    it('skips providers without precalculate method', async () => {
      const mockProviderWithoutPrecalc = createFakePartial<SystemContextProvider>({
        chatRequiredFeature: DuoFeature.IncludeUserRule,
        getItems: jest.fn(),
      });

      const mockProviderWithPrecalc = createFakePartial<SystemContextProvider>({
        chatRequiredFeature: DuoFeature.IncludeIssueContext,
        getItems: jest.fn(),
        precalculate: jest.fn(),
      });

      jest.mocked(mockProviderWithPrecalc.precalculate!).mockResolvedValue();

      systemContextManager = new DefaultSystemContextManager(
        testLogger,
        [mockProviderWithoutPrecalc, mockProviderWithPrecalc],
        mockDuoFeatureAccessService,
        mockSecretRedactor,
      );

      await systemContextManager.precalculateOnInitialized();

      expect(mockProviderWithPrecalc.precalculate).toHaveBeenCalledTimes(1);
    });

    it('handles precalculate errors gracefully and continues with other providers', async () => {
      const mockProvider1 = createFakePartial<SystemContextProvider>({
        chatRequiredFeature: DuoFeature.IncludeUserRule,
        getItems: jest.fn(),
        precalculate: jest.fn(),
      });

      const mockProvider2 = createFakePartial<SystemContextProvider>({
        chatRequiredFeature: DuoFeature.IncludeIssueContext,
        getItems: jest.fn(),
        precalculate: jest.fn(),
      });

      jest.mocked(mockProvider1.precalculate!).mockRejectedValue(new Error('Precalc failed'));
      jest.mocked(mockProvider2.precalculate!).mockResolvedValue();

      systemContextManager = new DefaultSystemContextManager(
        testLogger,
        [mockProvider1, mockProvider2],
        mockDuoFeatureAccessService,
        mockSecretRedactor,
      );

      await systemContextManager.precalculateOnInitialized();

      expect(mockProvider1.precalculate).toHaveBeenCalledTimes(1);
      expect(mockProvider2.precalculate).toHaveBeenCalledTimes(1);

      expect(testLogger.warnLogs[0].message).toBe(
        '[SystemContextManager] Error precalculating for system context provider',
      );
    });
  });

  describe('precalculateOnWorkflowStart', () => {
    it('calls precalculateOnWorkflowStart only on providers that define it', async () => {
      const mockInitProvider = createFakePartial<SystemContextProvider>({
        chatRequiredFeature: DuoFeature.IncludeUserRule,
        getItems: jest.fn(),
        precalculate: jest.fn(),
      });

      const mockWorkflowProvider = createFakePartial<SystemContextProvider>({
        chatRequiredFeature: DuoFeature.IncludeIssueContext,
        precalculateOnWorkflowStart: jest.fn(),
        getItems: jest.fn(),
        precalculate: jest.fn(),
      });

      jest
        .mocked(mockDuoFeatureAccessService.isChatFeatureEnabled)
        .mockResolvedValueOnce(true)
        .mockResolvedValueOnce(true);

      jest.mocked(mockWorkflowProvider.precalculate!).mockResolvedValue();

      systemContextManager = new DefaultSystemContextManager(
        testLogger,
        [mockInitProvider, mockWorkflowProvider],
        mockDuoFeatureAccessService,
        mockSecretRedactor,
      );

      await systemContextManager.precalculateOnWorkflowStart();

      expect(mockInitProvider.precalculate).not.toHaveBeenCalled();
      expect(mockWorkflowProvider.precalculate).not.toHaveBeenCalled();
      expect(mockWorkflowProvider.precalculateOnWorkflowStart).toHaveBeenCalledTimes(1);

      expect(testLogger.infoLogs[0].message).toBe(
        '[SystemContextManager] Precalculating system context for 1 providers on workflow start',
      );
      expect(testLogger.infoLogs[testLogger.infoLogs.length - 1].message).toBe(
        '[SystemContextManager] System context precalculation complete for workflow start',
      );
    });
  });
});
