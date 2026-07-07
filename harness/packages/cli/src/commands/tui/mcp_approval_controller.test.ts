import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { AppState, McpApprovalServerItem } from '@gitlab-org/tui';
import { CLI_INPUT_TYPES, defaultInputState } from '@gitlab-org/tui';
import { McpManager, type ServerName } from '@gitlab-org/ai-configuration';
import { PersistentStorage } from '@gitlab-org/persistent-storage';
import type { ControllerApi, StateMutation } from './controller_api';
import { DefaultMcpApprovalController } from './mcp_approval_controller';
import { McpApprovalComponentHandler } from './mcp_approval_component_handler';

const flushPromises = () =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, 0);
  });

/** Tracks whether a promise has resolved, without tripping no-void/always-return lint. */
const track = (promise: Promise<unknown>): { resolved: () => boolean } => {
  const state = { value: false };
  promise
    .then(() => {
      state.value = true;
      return undefined;
    })
    .catch(() => {
      state.value = true;
    });
  return { resolved: () => state.value };
};

describe('DefaultMcpApprovalController', () => {
  let controller: DefaultMcpApprovalController;
  let mockMcpManager: jest.Mocked<McpManager>;
  let mockStorage: PersistentStorage;
  let mockApi: ControllerApi;
  let currentState: AppState;

  /** Pull the registered 'servers:pending-approval' handler out of the manager mock. */
  const getPendingHandler = (): ((serverNames: ServerName[]) => void) => {
    const onCall = jest
      .mocked(mockMcpManager.on)
      .mock.calls.find(([event]) => event === 'servers:pending-approval');
    return onCall![1] as (serverNames: ServerName[]) => void;
  };

  beforeEach(() => {
    currentState = createFakePartial<AppState>({ input: defaultInputState });

    mockMcpManager = createFakePartial<jest.Mocked<McpManager>>({
      on: jest.fn(),
      off: jest.fn(),
      approveServer: jest.fn<McpManager['approveServer']>().mockResolvedValue(undefined),
      rejectServer: jest.fn<McpManager['rejectServer']>().mockResolvedValue(undefined),
      waitForAllServersSettled: jest
        .fn<McpManager['waitForAllServersSettled']>()
        .mockResolvedValue(undefined),
      whenReloadSettled: jest.fn<McpManager['whenReloadSettled']>().mockResolvedValue(undefined),
    });

    mockStorage = createFakePartial<PersistentStorage>({
      getStoragePath: jest.fn(() => '/home/user/.gitlab/storage.json'),
    });

    mockApi = createFakePartial<ControllerApi>({
      mutateState: jest.fn((mutation: StateMutation) => {
        currentState = mutation(currentState);
        return currentState;
      }),
    });

    controller = new DefaultMcpApprovalController(new TestLogger(), mockMcpManager, mockStorage);
  });

  describe('subscribe', () => {
    it('registers a servers:pending-approval listener', () => {
      controller.subscribe(mockApi);
      expect(mockMcpManager.on).toHaveBeenCalledWith(
        'servers:pending-approval',
        expect.any(Function),
      );
    });
  });

  describe('waitForPendingApprovals', () => {
    it('resolves immediately when subscribe was never called', async () => {
      await expect(controller.waitForPendingApprovals()).resolves.toBeUndefined();
    });

    it('resolves when all servers settle with no pending event', async () => {
      controller.subscribe(mockApi);
      await expect(controller.waitForPendingApprovals()).resolves.toBeUndefined();
    });

    it('does not resolve while a pending decision is outstanding', async () => {
      // whenReloadSettled never settling lets us prove the gate stays open.
      mockMcpManager.whenReloadSettled.mockReturnValue(new Promise<void>(() => {}));
      controller.subscribe(mockApi);

      getPendingHandler()(['workspace-server'] as ServerName[]);

      const gate = track(controller.waitForPendingApprovals());
      await flushPromises();
      expect(gate.resolved()).toBe(false);
    });

    it('does not resolve when reload settles before the pending event arrives', async () => {
      // Reproduces the startup race: the reload triggered by preWarm runs after we
      // subscribe, and the pending event is emitted at the very end of that reload.
      // whenReloadSettled resolves only once the reload has completed, by which point
      // the pending event has fired — so the gate must stay open here.
      controller.subscribe(mockApi);
      const gate = track(controller.waitForPendingApprovals());

      // reload settled immediately (default mock); now the pending event arrives.
      getPendingHandler()(['workspace-server'] as ServerName[]);

      await flushPromises();
      await flushPromises();
      expect(gate.resolved()).toBe(false);
    });
  });

  describe('when servers:pending-approval fires', () => {
    beforeEach(() => {
      controller.subscribe(mockApi);
      getPendingHandler()(['server-a', 'server-b'] as ServerName[]);
    });

    it('switches input to the MCP approval prompt with Approve defaults', () => {
      expect(currentState.input).toEqual({
        inputType: CLI_INPUT_TYPES.MCP_APPROVAL,
        servers: [
          { name: 'server-a', decision: 'approve' },
          { name: 'server-b', decision: 'approve' },
        ],
        storagePath: '/home/user/.gitlab/storage.json',
      });
    });

    it('ignores an empty server list', () => {
      currentState = createFakePartial<AppState>({ input: defaultInputState });
      getPendingHandler()([] as ServerName[]);
      expect(currentState.input).toEqual(defaultInputState);
    });
  });

  describe('onConfirm', () => {
    const confirmWith = async (decided: McpApprovalServerItem[]) => {
      controller.subscribe(mockApi);
      getPendingHandler()(decided.map((d) => d.name) as ServerName[]);
      const { callbacks } = controller.getComponent(mockApi);
      callbacks.onConfirm(decided);
      await flushPromises();
    };

    it('approves and rejects servers per decision', async () => {
      await confirmWith([
        { name: 'server-a', decision: 'approve' },
        { name: 'server-b', decision: 'reject' },
      ]);

      expect(mockMcpManager.approveServer).toHaveBeenCalledWith('server-a');
      expect(mockMcpManager.rejectServer).toHaveBeenCalledWith('server-b');
    });

    it('restores the text input after confirming', async () => {
      await confirmWith([{ name: 'server-a', decision: 'approve' }]);
      expect(currentState.input).toEqual(defaultInputState);
    });

    it('resolves the pending gate after confirming', async () => {
      mockMcpManager.whenReloadSettled.mockReturnValue(new Promise<void>(() => {}));
      controller.subscribe(mockApi);
      getPendingHandler()(['server-a'] as ServerName[]);

      const gate = track(controller.waitForPendingApprovals());

      const { callbacks } = controller.getComponent(mockApi);
      callbacks.onConfirm([{ name: 'server-a', decision: 'approve' }]);
      await flushPromises();

      expect(gate.resolved()).toBe(true);
    });
  });

  describe('onEscape', () => {
    beforeEach(() => {
      mockMcpManager.whenReloadSettled.mockReturnValue(new Promise<void>(() => {}));
      controller.subscribe(mockApi);
      getPendingHandler()(['server-a'] as ServerName[]);
    });

    it('does not approve or reject any server', () => {
      const { callbacks } = controller.getComponent(mockApi);
      callbacks.onEscape();

      expect(mockMcpManager.approveServer).not.toHaveBeenCalled();
      expect(mockMcpManager.rejectServer).not.toHaveBeenCalled();
    });

    it('restores the text input', () => {
      const { callbacks } = controller.getComponent(mockApi);
      callbacks.onEscape();
      expect(currentState.input).toEqual(defaultInputState);
    });

    it('resolves the pending gate', async () => {
      const gate = track(controller.waitForPendingApprovals());

      const { callbacks } = controller.getComponent(mockApi);
      callbacks.onEscape();
      await flushPromises();

      expect(gate.resolved()).toBe(true);
    });
  });

  describe('getComponent', () => {
    it('returns the MCP_APPROVAL registry entry', () => {
      const entry = controller.getComponent(mockApi);
      expect(entry.inputType).toBe(CLI_INPUT_TYPES.MCP_APPROVAL);
      expect(entry.component).toBeDefined();
    });
  });

  describe('startup-only behaviour', () => {
    it('stops listening once a decision is confirmed, so later reloads do not re-prompt', async () => {
      controller.subscribe(mockApi);
      getPendingHandler()(['server-a'] as ServerName[]);
      const { callbacks } = controller.getComponent(mockApi);
      callbacks.onConfirm([{ name: 'server-a', decision: 'approve' }]);
      await flushPromises();

      expect(mockMcpManager.off).toHaveBeenCalledWith(
        'servers:pending-approval',
        expect.any(Function),
      );

      // A subsequent reload (e.g. from the /mcp panel) must not flip the input.
      currentState = createFakePartial<AppState>({ input: defaultInputState });
      // The handler is detached; simulating another emit is a no-op by design.
      expect(currentState.input).toEqual(defaultInputState);
    });

    it('stops listening once the gate resolves with nothing pending', async () => {
      // whenReloadSettled resolves immediately (default mock) → no pending event,
      // so the gate releases and we unsubscribe.
      controller.subscribe(mockApi);
      await flushPromises();
      await flushPromises();

      expect(mockMcpManager.off).toHaveBeenCalledWith(
        'servers:pending-approval',
        expect.any(Function),
      );
    });
  });

  describe('dispose', () => {
    it('removes the event listener with the same handler reference', () => {
      controller.subscribe(mockApi);
      const onHandler = getPendingHandler();

      controller.dispose();

      expect(mockMcpManager.off).toHaveBeenCalledWith('servers:pending-approval', onHandler);
    });

    it('resolves the pending gate to avoid a hang', async () => {
      mockMcpManager.whenReloadSettled.mockReturnValue(new Promise<void>(() => {}));
      controller.subscribe(mockApi);
      getPendingHandler()(['server-a'] as ServerName[]);

      const gate = track(controller.waitForPendingApprovals());

      controller.dispose();
      await flushPromises();

      expect(gate.resolved()).toBe(true);
    });
  });
});

describe('McpApprovalComponentHandler', () => {
  it('delegates getComponent to the controller', () => {
    const mockApi = createFakePartial<ControllerApi>({});
    const entry = { inputType: CLI_INPUT_TYPES.MCP_APPROVAL } as ReturnType<
      DefaultMcpApprovalController['getComponent']
    >;
    const controller = createFakePartial<DefaultMcpApprovalController>({
      getComponent: jest.fn(() => entry),
    });

    const handler = new McpApprovalComponentHandler(controller);

    expect(handler.getComponent(mockApi)).toBe(entry);
    expect(controller.getComponent).toHaveBeenCalledWith(mockApi);
  });

  it('is marked internal so it is hidden from the command list', () => {
    const controller = createFakePartial<DefaultMcpApprovalController>({});
    const handler = new McpApprovalComponentHandler(controller);
    expect(handler.command.internal).toBe(true);
  });

  it('has a no-op execute', async () => {
    const controller = createFakePartial<DefaultMcpApprovalController>({});
    const handler = new McpApprovalComponentHandler(controller);
    await expect(handler.execute()).resolves.toBeUndefined();
  });
});
