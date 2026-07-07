import { Disposable } from '@gitlab-org/disposable';
import { createFakePartial } from '@gitlab-org/test-utils';
import {
  FLOWS_INSTANCE_FLAG_DISABLED,
  InstanceFeatureFlagsService,
  InstanceFeatureFlags,
} from '@gitlab-org/core';
import { TestLogger, Logger } from '@gitlab-org/logging';
import {
  DefaultFlowsInstanceFlagCheck,
  DefaultFlowsInstanceFlagConfigCheck,
} from './flows_instance_flag_check';

describe('FlowsInstanceFlagCheck', () => {
  const disposables: Disposable[] = [];
  let mockFeatureFlagsService: InstanceFeatureFlagsService;
  let logger: Logger;
  let flowsInstanceFlagCheck: DefaultFlowsInstanceFlagCheck;
  let debugLogSpy: jest.SpyInstance;
  let onChangedCallback: (flags: Map<string, boolean>) => void;

  const expectDebugLogToBeCalledWith = (substr: string) => {
    if (debugLogSpy) {
      expect(debugLogSpy).toHaveBeenCalledWith(expect.stringContaining(substr), undefined);
    }
  };

  const createFlowsInstanceFlagCheck = () => {
    return new DefaultFlowsInstanceFlagCheck(mockFeatureFlagsService, logger);
  };

  beforeEach(() => {
    jest.useFakeTimers();

    mockFeatureFlagsService = createFakePartial<InstanceFeatureFlagsService>({
      isInstanceFlagEnabled: jest.fn().mockReturnValue(false),
      onChanged: jest.fn().mockImplementation((callback) => {
        onChangedCallback = callback;
        callback(new Map());
        return { dispose: jest.fn() };
      }),
    });

    logger = new TestLogger();

    debugLogSpy = jest.spyOn(logger, 'debug');
  });

  afterEach(() => {
    while (disposables.length > 0) {
      disposables.pop()!.dispose();
    }
    jest.useRealTimers();
  });

  describe('initialization', () => {
    it('should initialize FlowsInstanceFlagCheck correctly', async () => {
      flowsInstanceFlagCheck = createFlowsInstanceFlagCheck();

      expect(flowsInstanceFlagCheck.id).toBe(FLOWS_INSTANCE_FLAG_DISABLED);
      expect(mockFeatureFlagsService.onChanged).toHaveBeenCalled();
    });

    it('should start with flag disabled by default', async () => {
      flowsInstanceFlagCheck = createFlowsInstanceFlagCheck();

      expect(flowsInstanceFlagCheck.engaged).toBe(true);
      expect(flowsInstanceFlagCheck.details).toBe(
        'Flows feature flag is disabled on this GitLab instance. Contact your GitLab administrator to enable the duo_workflow feature flag.',
      );
    });
  });

  describe('feature flag subscription', () => {
    it('should subscribe to feature flag changes', () => {
      flowsInstanceFlagCheck = createFlowsInstanceFlagCheck();

      expect(mockFeatureFlagsService.onChanged).toHaveBeenCalledWith(expect.any(Function));
    });

    it('should react to feature flag changes', () => {
      const mockListener = jest.fn();
      flowsInstanceFlagCheck = createFlowsInstanceFlagCheck();
      flowsInstanceFlagCheck.onChanged(mockListener);

      expect(flowsInstanceFlagCheck.engaged).toBe(true);

      const flagsMap = new Map([[InstanceFeatureFlags.DuoWorkflow, true]]);
      onChangedCallback(flagsMap);

      expect(flowsInstanceFlagCheck.engaged).toBe(false);
      expect(mockListener).toHaveBeenCalledWith({
        checkId: FLOWS_INSTANCE_FLAG_DISABLED,
        engaged: false,
        details: 'Flows feature flag is enabled on this GitLab instance',
      });
    });

    it('should handle missing flag in subscription callback', () => {
      flowsInstanceFlagCheck = createFlowsInstanceFlagCheck();

      const flagsMap = new Map();
      onChangedCallback(flagsMap);

      expect(flowsInstanceFlagCheck.engaged).toBe(true);
      expectDebugLogToBeCalledWith('Flows instance feature flag changed to disabled');
    });
  });

  describe('details getter', () => {
    it('should return flag enabled message when not engaged', () => {
      flowsInstanceFlagCheck = createFlowsInstanceFlagCheck();

      const flagsMap = new Map([[InstanceFeatureFlags.DuoWorkflow, true]]);
      onChangedCallback(flagsMap);

      expect(flowsInstanceFlagCheck.engaged).toBe(false);
      expect(flowsInstanceFlagCheck.details).toBe(
        'Flows feature flag is enabled on this GitLab instance',
      );
    });

    it('should return flag disabled message when engaged', () => {
      flowsInstanceFlagCheck = createFlowsInstanceFlagCheck();

      expect(flowsInstanceFlagCheck.engaged).toBe(true);
      expect(flowsInstanceFlagCheck.details).toBe(
        'Flows feature flag is disabled on this GitLab instance. Contact your GitLab administrator to enable the duo_workflow feature flag.',
      );
    });
  });

  describe('onChanged', () => {
    it('should emit events when flag status changes', () => {
      const mockListener = jest.fn();

      flowsInstanceFlagCheck = createFlowsInstanceFlagCheck();
      const disposable = flowsInstanceFlagCheck.onChanged(mockListener);

      const flagsMap = new Map([[InstanceFeatureFlags.DuoWorkflow, true]]);
      onChangedCallback(flagsMap);

      expect(mockListener).toHaveBeenCalledWith({
        checkId: flowsInstanceFlagCheck.id,
        engaged: false,
        details: 'Flows feature flag is enabled on this GitLab instance',
      });

      disposable.dispose();
    });

    it('should handle multiple listeners', () => {
      const mockListener1 = jest.fn();
      const mockListener2 = jest.fn();

      flowsInstanceFlagCheck = createFlowsInstanceFlagCheck();
      flowsInstanceFlagCheck.onChanged(mockListener1);
      flowsInstanceFlagCheck.onChanged(mockListener2);

      const flagsMap = new Map([[InstanceFeatureFlags.DuoWorkflow, true]]);
      onChangedCallback(flagsMap);

      expect(mockListener1).toHaveBeenCalledWith({
        checkId: flowsInstanceFlagCheck.id,
        engaged: false,
        details: 'Flows feature flag is enabled on this GitLab instance',
      });
      expect(mockListener2).toHaveBeenCalledWith({
        checkId: flowsInstanceFlagCheck.id,
        engaged: false,
        details: 'Flows feature flag is enabled on this GitLab instance',
      });
    });
  });

  describe('dispose', () => {
    it('should dispose subscriptions', () => {
      const mockDispose = jest.fn();
      jest
        .mocked(mockFeatureFlagsService.onChanged as jest.Mock)
        .mockReturnValue({ dispose: mockDispose });

      flowsInstanceFlagCheck = createFlowsInstanceFlagCheck();
      flowsInstanceFlagCheck.dispose();

      expect(mockDispose).toHaveBeenCalled();
    });

    it('should handle dispose being called multiple times', () => {
      flowsInstanceFlagCheck = createFlowsInstanceFlagCheck();

      flowsInstanceFlagCheck.dispose();
      expect(() => flowsInstanceFlagCheck.dispose()).not.toThrow();
    });
  });
});

describe('DefaultFlowsInstanceFlagConfigCheck (stateless)', () => {
  let mockFeatureFlagsService: InstanceFeatureFlagsService;

  const createCheck = () => new DefaultFlowsInstanceFlagConfigCheck(mockFeatureFlagsService);

  beforeEach(() => {
    mockFeatureFlagsService = createFakePartial<InstanceFeatureFlagsService>({
      isInstanceFlagEnabled: jest.fn().mockReturnValue(false),
    });
  });

  it('returns engaged=true when flag is disabled', async () => {
    const result = await createCheck().validate({});

    expect(result).toEqual({
      checkId: FLOWS_INSTANCE_FLAG_DISABLED,
      details:
        'Flows feature flag is disabled on this GitLab instance. Contact your GitLab administrator to enable the duo_workflow feature flag.',
      engaged: true,
    });
  });

  it('returns engaged=false when flag is enabled', async () => {
    (mockFeatureFlagsService.isInstanceFlagEnabled as jest.Mock).mockReturnValue(true);

    const result = await createCheck().validate({});

    expect(result).toEqual({
      checkId: FLOWS_INSTANCE_FLAG_DISABLED,
      details: 'Flows feature flag is enabled on this GitLab instance',
      engaged: false,
    });
  });

  it('queries the feature flag service directly without subscribing', async () => {
    const check = createCheck();
    await check.validate({});

    expect(mockFeatureFlagsService.isInstanceFlagEnabled).toHaveBeenCalledWith(
      InstanceFeatureFlags.DuoWorkflow,
    );
  });
});
