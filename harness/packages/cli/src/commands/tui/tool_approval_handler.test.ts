import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { createFakePartial } from '@gitlab-org/test-utils';
import { TestLogger } from '@gitlab-org/logging';
import type { SecretRedactor } from '@gitlab-org/secret-redaction';
import type { AppState, ToolCall } from '@gitlab-org/tui';
import { CLI_INPUT_TYPES } from '@gitlab-org/tui';
import { DuoAgentPlatformEvent, type DuoAgentPlatformTracker } from '@gitlab-org/telemetry';
import type { ToolApprovalAction } from '../../backend/backend';
import { UserActionType } from '../../backend/backend';
import type { ControllerApi } from './controller_api';
import { DefaultToolApprovalHandler } from './tool_approval_handler';

describe('DefaultToolApprovalHandler', () => {
  let handler: DefaultToolApprovalHandler;
  let mockLogger: TestLogger;
  let mockSecretRedactor: SecretRedactor;
  let mockTracker: DuoAgentPlatformTracker;

  const toolCall = createFakePartial<ToolCall>({
    id: 'tool-1',
    name: 'shell_command',
    input: { tool: 'shell_command', command: 'echo test' },
    state: { type: 'approval_request', content: '', availableScopes: ['once', 'session'] },
  });

  let capturedState: AppState | undefined;
  let mockApi: ControllerApi;

  beforeEach(() => {
    mockLogger = new TestLogger();
    mockSecretRedactor = createFakePartial<SecretRedactor>({
      redactSecrets: jest.fn<SecretRedactor['redactSecrets']>().mockImplementation((text) => text),
    });
    mockTracker = createFakePartial<DuoAgentPlatformTracker>({
      trackEvent: jest.fn(),
    });
    handler = new DefaultToolApprovalHandler(mockLogger, mockSecretRedactor, mockTracker);

    capturedState = undefined;
    mockApi = createFakePartial<ControllerApi>({
      mutateState: jest.fn<ControllerApi['mutateState']>((mutation) => {
        const state = createFakePartial<AppState>({
          input: { inputType: 'text', lines: [''], cursorLine: 0, cursorColumn: 0 },
        });
        capturedState = mutation(state);
        return capturedState;
      }),
      sendToolApproval: jest.fn(),
    });
  });

  describe('presentApprovalChoices', () => {
    it('sets the input to CHOICE with Approve, Approve for session, and Reject options', () => {
      handler.presentApprovalChoices(mockApi, [toolCall]);

      expect(mockApi.mutateState).toHaveBeenCalled();
      expect(capturedState?.input).toEqual({
        inputType: CLI_INPUT_TYPES.CHOICE,
        choiceOptions: [
          {
            label: 'Approve',
            value: {
              type: UserActionType.SendToolApproval,
              toolId: 'tool-1',
              toolName: 'shell_command',
              approved: true,
              scope: 'once',
              toolArgs: { command: 'echo test' },
            },
          },
          {
            label: 'Approve for session',
            value: {
              type: UserActionType.SendToolApproval,
              toolId: 'tool-1',
              toolName: 'shell_command',
              approved: true,
              scope: 'session',
              toolArgs: { command: 'echo test' },
            },
          },
          {
            label: 'Reject',
            value: {
              type: UserActionType.SendToolApproval,
              toolId: 'tool-1',
              toolName: 'shell_command',
              approved: false,
              toolArgs: { command: 'echo test' },
            },
          },
        ],
        selectedChoiceIndex: 0,
      });
    });

    describe('when multiple tool calls are passed (parallel batch)', () => {
      const toolCall2 = createFakePartial<ToolCall>({
        id: 'tool-2',
        name: 'read_file',
        input: { tool: 'read_file', filepath: '/etc/passwd' },
        state: { type: 'approval_request', content: '', availableScopes: ['once'] },
      });

      it('presents only the first tool for approval', () => {
        handler.presentApprovalChoices(mockApi, [toolCall, toolCall2]);

        expect(mockApi.mutateState).toHaveBeenCalledTimes(1);
        expect(capturedState?.input).toMatchObject({
          inputType: CLI_INPUT_TYPES.CHOICE,
          choiceOptions: expect.arrayContaining([
            expect.objectContaining({ value: expect.objectContaining({ toolId: 'tool-1' }) }),
          ]),
        });
        // tool-2 is queued, not presented yet
        expect(capturedState?.input).toMatchObject({
          choiceOptions: expect.not.arrayContaining([
            expect.objectContaining({ value: expect.objectContaining({ toolId: 'tool-2' }) }),
          ]),
        });
      });

      describe('when the first tool is approved', () => {
        const approveAction: ToolApprovalAction = {
          type: UserActionType.SendToolApproval,
          toolId: 'tool-1',
          toolName: 'shell_command',
          approved: true,
          scope: 'once',
        };

        beforeEach(() => {
          handler.presentApprovalChoices(mockApi, [toolCall, toolCall2]);
          handler.handleChoiceSubmit(mockApi, approveAction);
        });

        it('sends approval for the first tool', () => {
          expect(mockApi.sendToolApproval).toHaveBeenCalledWith(approveAction);
        });

        it('auto-approves the queued tool with the same scope', () => {
          expect(mockApi.sendToolApproval).toHaveBeenCalledWith({
            type: UserActionType.SendToolApproval,
            toolId: 'tool-2',
            toolName: 'read_file',
            agentMode: undefined,
            toolArgs: { filepath: '/etc/passwd' },
            approved: true,
            scope: 'once',
          });
        });

        it('sends exactly two sendToolApproval calls', () => {
          expect(mockApi.sendToolApproval).toHaveBeenCalledTimes(2);
        });

        it('tracks telemetry for both tools', () => {
          expect(mockTracker.trackEvent).toHaveBeenCalledTimes(2);
          expect(mockTracker.trackEvent).toHaveBeenNthCalledWith(
            1,
            DuoAgentPlatformEvent.ToolApprovalSubmitted,
            { source: 'cli', toolName: 'shell_command', approvalScope: 'once' },
          );
          expect(mockTracker.trackEvent).toHaveBeenNthCalledWith(
            2,
            DuoAgentPlatformEvent.ToolApprovalSubmitted,
            { source: 'cli', toolName: 'read_file', approvalScope: 'once' },
          );
        });
      });

      describe('when the first tool is rejected', () => {
        const rejectAction: ToolApprovalAction = {
          type: UserActionType.SendToolApproval,
          toolId: 'tool-1',
          toolName: 'shell_command',
          approved: false,
        };

        beforeEach(() => {
          handler.presentApprovalChoices(mockApi, [toolCall, toolCall2]);
          handler.handleChoiceSubmit(mockApi, rejectAction);
        });

        it('propagates the rejection reason to the queued tool after reason is submitted', () => {
          const callbacks = handler.getCallbacks(mockApi);
          callbacks.onSubmitRejectionReason('too risky');

          expect(mockApi.sendToolApproval).toHaveBeenCalledTimes(2);
          expect(mockApi.sendToolApproval).toHaveBeenCalledWith(
            expect.objectContaining({
              toolId: 'tool-2',
              approved: false,
              rejectionReason: 'too risky',
            }),
          );
        });

        it('does not track telemetry for rejected tools', () => {
          const callbacks = handler.getCallbacks(mockApi);
          callbacks.onSubmitRejectionReason('too risky');

          expect(mockTracker.trackEvent).not.toHaveBeenCalled();
        });

        describe('when rejection is cancelled then approved', () => {
          it('still drains the queue when the re-shown approval is accepted', () => {
            const callbacks = handler.getCallbacks(mockApi);
            callbacks.onCancelRejectionReason();

            const approveAfterCancel: ToolApprovalAction = {
              type: UserActionType.SendToolApproval,
              toolId: 'tool-1',
              toolName: 'shell_command',
              approved: true,
              scope: 'once',
            };
            handler.handleChoiceSubmit(mockApi, approveAfterCancel);

            expect(mockApi.sendToolApproval).toHaveBeenCalledTimes(2);
            expect(mockApi.sendToolApproval).toHaveBeenCalledWith(
              expect.objectContaining({ toolId: 'tool-2', approved: true, scope: 'once' }),
            );
          });
        });
      });
    });

    describe('when there is a stale pending rejection', () => {
      beforeEach(() => {
        const rejectAction: ToolApprovalAction = {
          type: UserActionType.SendToolApproval,
          toolId: 'tool-1',
          toolName: 'shell_command',
          agentMode: undefined,
          toolArgs: {},
          approved: false,
        };
        handler.handleChoiceSubmit(mockApi, rejectAction);

        const newToolCall = createFakePartial<ToolCall>({
          id: 'tool-2',
          name: 'read_file',
          input: { tool: 'read_file', filepath: '/test/file.ts' },
          state: { type: 'approval_request', content: '', availableScopes: ['once'] },
        });
        handler.presentApprovalChoices(mockApi, [newToolCall]);
      });

      it('clears the stale pending rejection', () => {
        const callbacks = handler.getCallbacks(mockApi);
        callbacks.onCancelRejectionReason();

        expect(mockApi.sendToolApproval).not.toHaveBeenCalled();
      });
    });
  });

  describe('autoApproveAll', () => {
    const toolCall2 = createFakePartial<ToolCall>({
      id: 'tool-2',
      name: 'read_file',
      input: { tool: 'read_file', filepath: '/etc/hosts' },
      state: { type: 'approval_request', content: '', availableScopes: ['once'] },
    });

    it('does nothing for an empty list', () => {
      handler.autoApproveAll(mockApi, []);

      expect(mockApi.sendToolApproval).not.toHaveBeenCalled();
      expect(mockApi.mutateState).not.toHaveBeenCalled();
    });

    it('approves a single pending tool with scope once without prompting', () => {
      handler.autoApproveAll(mockApi, [toolCall], 'build');

      expect(mockApi.mutateState).not.toHaveBeenCalled();
      expect(mockApi.sendToolApproval).toHaveBeenCalledTimes(1);
      expect(mockApi.sendToolApproval).toHaveBeenCalledWith({
        type: UserActionType.SendToolApproval,
        toolId: 'tool-1',
        toolName: 'shell_command',
        agentMode: 'build',
        toolArgs: { command: 'echo test' },
        approved: true,
        scope: 'once',
      });
    });

    it('approves every tool in a parallel batch', () => {
      handler.autoApproveAll(mockApi, [toolCall, toolCall2]);

      expect(mockApi.sendToolApproval).toHaveBeenCalledTimes(2);
      expect(mockApi.sendToolApproval).toHaveBeenCalledWith(
        expect.objectContaining({ toolId: 'tool-1', approved: true, scope: 'once' }),
      );
      expect(mockApi.sendToolApproval).toHaveBeenCalledWith(
        expect.objectContaining({ toolId: 'tool-2', approved: true, scope: 'once' }),
      );
    });

    it('tracks telemetry for each auto-approved tool', () => {
      handler.autoApproveAll(mockApi, [toolCall, toolCall2]);

      expect(mockTracker.trackEvent).toHaveBeenCalledTimes(2);
      expect(mockTracker.trackEvent).toHaveBeenCalledWith(
        DuoAgentPlatformEvent.ToolApprovalSubmitted,
        { source: 'cli', toolName: 'shell_command', approvalScope: 'once' },
      );
      expect(mockTracker.trackEvent).toHaveBeenCalledWith(
        DuoAgentPlatformEvent.ToolApprovalSubmitted,
        { source: 'cli', toolName: 'read_file', approvalScope: 'once' },
      );
    });
  });

  describe('handleChoiceSubmit', () => {
    describe('when action is approved', () => {
      const approveAction: ToolApprovalAction = {
        type: UserActionType.SendToolApproval,
        toolId: 'tool-1',
        toolName: 'shell_command',
        approved: true,
        scope: 'session',
      };

      it('sends the approval via the api', () => {
        handler.handleChoiceSubmit(mockApi, approveAction);

        expect(mockApi.sendToolApproval).toHaveBeenCalledWith(approveAction);
      });

      it('does not mutate state', () => {
        handler.handleChoiceSubmit(mockApi, approveAction);

        expect(mockApi.mutateState).not.toHaveBeenCalled();
      });

      it('tracks telemetry with scope session', () => {
        handler.handleChoiceSubmit(mockApi, approveAction);

        expect(mockTracker.trackEvent).toHaveBeenCalledWith(
          DuoAgentPlatformEvent.ToolApprovalSubmitted,
          { source: 'cli', toolName: 'shell_command', approvalScope: 'session' },
        );
      });
    });

    describe('when action is approved with scope once', () => {
      const approveOnceAction: ToolApprovalAction = {
        type: UserActionType.SendToolApproval,
        toolId: 'tool-1',
        toolName: 'shell_command',
        approved: true,
        scope: 'once',
      };

      it('sends the approval via the api', () => {
        handler.handleChoiceSubmit(mockApi, approveOnceAction);

        expect(mockApi.sendToolApproval).toHaveBeenCalledWith(approveOnceAction);
      });

      it('does not mutate state', () => {
        handler.handleChoiceSubmit(mockApi, approveOnceAction);

        expect(mockApi.mutateState).not.toHaveBeenCalled();
      });

      it('tracks telemetry with scope once', () => {
        handler.handleChoiceSubmit(mockApi, approveOnceAction);

        expect(mockTracker.trackEvent).toHaveBeenCalledWith(
          DuoAgentPlatformEvent.ToolApprovalSubmitted,
          { source: 'cli', toolName: 'shell_command', approvalScope: 'once' },
        );
      });
    });

    describe('when action is rejected', () => {
      const rejectAction: ToolApprovalAction = {
        type: UserActionType.SendToolApproval,
        toolId: 'tool-1',
        toolName: 'shell_command',
        agentMode: undefined,
        toolArgs: {},
        approved: false,
      };

      it('does not send an approval', () => {
        handler.handleChoiceSubmit(mockApi, rejectAction);

        expect(mockApi.sendToolApproval).not.toHaveBeenCalled();
      });

      it('sets input to TOOL_REJECTION_REASON', () => {
        handler.handleChoiceSubmit(mockApi, rejectAction);

        expect(capturedState?.input).toEqual({
          inputType: CLI_INPUT_TYPES.TOOL_REJECTION_REASON,
          toolName: 'shell_command',
        });
      });
    });
  });

  describe('getCallbacks', () => {
    describe('onSubmitRejectionReason', () => {
      describe('when there is a pending rejection', () => {
        beforeEach(() => {
          const rejectAction: ToolApprovalAction = {
            type: UserActionType.SendToolApproval,
            toolId: 'tool-1',
            toolName: 'shell_command',
            approved: false,
          };
          handler.handleChoiceSubmit(mockApi, rejectAction);
        });

        it('sends the rejection with the reason via the api', () => {
          const callbacks = handler.getCallbacks(mockApi);
          callbacks.onSubmitRejectionReason('too dangerous');

          expect(mockApi.sendToolApproval).toHaveBeenCalledWith({
            type: UserActionType.SendToolApproval,
            toolId: 'tool-1',
            toolName: 'shell_command',
            approved: false,
            rejectionReason: 'too dangerous',
          });
        });

        it('truncates reasons exceeding the max length', () => {
          const longReason = 'x'.repeat(600);
          const callbacks = handler.getCallbacks(mockApi);
          callbacks.onSubmitRejectionReason(longReason);

          expect(mockApi.sendToolApproval).toHaveBeenCalledWith(
            expect.objectContaining({ rejectionReason: 'x'.repeat(500) }),
          );
        });

        it('trims whitespace from the reason', () => {
          const callbacks = handler.getCallbacks(mockApi);
          callbacks.onSubmitRejectionReason('  too dangerous  ');

          expect(mockApi.sendToolApproval).toHaveBeenCalledWith(
            expect.objectContaining({ rejectionReason: 'too dangerous' }),
          );
        });

        it('redacts secrets from the reason', () => {
          jest.mocked(mockSecretRedactor.redactSecrets).mockReturnValueOnce('password is *****');

          const callbacks = handler.getCallbacks(mockApi);
          callbacks.onSubmitRejectionReason('password is glpat-abc123');

          expect(mockSecretRedactor.redactSecrets).toHaveBeenCalledWith(
            'password is glpat-abc123',
            'user-input',
          );
          expect(mockApi.sendToolApproval).toHaveBeenCalledWith(
            expect.objectContaining({ rejectionReason: 'password is *****' }),
          );
        });

        describe('when reason is empty or whitespace-only', () => {
          it.each([
            { description: 'empty string', reason: '' },
            { description: 'whitespace only', reason: '   ' },
          ])('passes rejectionReason as undefined for $description', ({ reason }) => {
            const callbacks = handler.getCallbacks(mockApi);
            callbacks.onSubmitRejectionReason(reason);

            expect(mockApi.sendToolApproval).toHaveBeenCalledWith(
              expect.objectContaining({ rejectionReason: undefined }),
            );
          });
        });
      });

      describe('when there is no pending rejection', () => {
        it('does nothing', () => {
          const callbacks = handler.getCallbacks(mockApi);
          callbacks.onSubmitRejectionReason('some reason');

          expect(mockApi.sendToolApproval).not.toHaveBeenCalled();
        });
      });
    });

    describe('onCancelRejectionReason', () => {
      describe('when there is a pending rejection', () => {
        let callCountBeforeCancel: number;

        beforeEach(() => {
          handler.presentApprovalChoices(mockApi, [toolCall]);
          const rejectAction: ToolApprovalAction = {
            type: UserActionType.SendToolApproval,
            toolId: 'tool-1',
            toolName: 'shell_command',
            toolArgs: { command: 'echo test' },
            approved: false,
          };
          handler.handleChoiceSubmit(mockApi, rejectAction);
          callCountBeforeCancel = jest.mocked(mockApi.mutateState).mock.calls.length;
        });

        it('restores the choice state via mutateState', () => {
          const callbacks = handler.getCallbacks(mockApi);
          callbacks.onCancelRejectionReason();

          expect(jest.mocked(mockApi.mutateState).mock.calls.length).toBeGreaterThan(
            callCountBeforeCancel,
          );
          expect(capturedState?.input).toEqual({
            inputType: CLI_INPUT_TYPES.CHOICE,
            choiceOptions: [
              {
                label: 'Approve',
                value: {
                  type: UserActionType.SendToolApproval,
                  toolId: 'tool-1',
                  toolName: 'shell_command',
                  agentMode: undefined,
                  toolArgs: { command: 'echo test' },
                  approved: true,
                  scope: 'once',
                },
              },
              {
                label: 'Approve for session',
                value: {
                  type: UserActionType.SendToolApproval,
                  toolId: 'tool-1',
                  toolName: 'shell_command',
                  agentMode: undefined,
                  toolArgs: { command: 'echo test' },
                  approved: true,
                  scope: 'session',
                },
              },
              {
                label: 'Reject',
                value: {
                  type: UserActionType.SendToolApproval,
                  toolId: 'tool-1',
                  toolName: 'shell_command',
                  agentMode: undefined,
                  toolArgs: { command: 'echo test' },
                  approved: false,
                },
              },
            ],
            selectedChoiceIndex: 0,
          });
        });

        it('restores pattern options when suggestedPatterns were present', () => {
          const toolCallWithPatterns = createFakePartial<ToolCall>({
            id: 'tool-2',
            name: 'shell_command',
            input: { tool: 'shell_command', command: 'git log --oneline -5' },
            state: {
              type: 'approval_request',
              content: '',
              availableScopes: ['once', 'session'],
              suggestedPatterns: ['git log --oneline *', 'git log *'],
            },
          });

          handler.presentApprovalChoices(mockApi, [toolCallWithPatterns]);
          handler.handleChoiceSubmit(mockApi, {
            type: UserActionType.SendToolApproval,
            toolId: 'tool-2',
            toolName: 'shell_command',
            approved: false,
          });

          const callbacks = handler.getCallbacks(mockApi);
          callbacks.onCancelRejectionReason();

          expect(capturedState?.input).toEqual(
            expect.objectContaining({
              inputType: CLI_INPUT_TYPES.CHOICE,
              choiceOptions: expect.arrayContaining([
                expect.objectContaining({
                  label: 'Approve for session:',
                  secondaryLabel: 'git log --oneline *',
                }),
                expect.objectContaining({
                  label: 'Approve for session:',
                  secondaryLabel: 'git log *',
                }),
              ]),
            }),
          );
        });

        it('clears the pending rejection', () => {
          const callbacks = handler.getCallbacks(mockApi);
          callbacks.onCancelRejectionReason();

          callbacks.onSubmitRejectionReason('late reason');
          expect(mockApi.sendToolApproval).not.toHaveBeenCalled();
        });
      });

      describe('when there is no pending rejection', () => {
        it('does nothing', () => {
          const callbacks = handler.getCallbacks(mockApi);
          callbacks.onCancelRejectionReason();

          expect(mockApi.mutateState).not.toHaveBeenCalled();
        });
      });
    });
  });

  describe('isPromptingFor', () => {
    const buildChoiceState = (toolId: string): AppState =>
      createFakePartial<AppState>({
        input: {
          inputType: CLI_INPUT_TYPES.CHOICE,
          choiceOptions: [
            {
              label: 'Approve',
              value: {
                type: UserActionType.SendToolApproval,
                toolId,
                toolName: 'shell_command',
                approved: true,
                scope: 'once',
              } satisfies ToolApprovalAction,
            },
          ],
          selectedChoiceIndex: 0,
        },
      });

    it('returns true when prompting for the given tool', () => {
      expect(handler.isPromptingFor(buildChoiceState('tool-1'), 'tool-1')).toBe(true);
    });

    it('returns false when prompting for a different tool', () => {
      expect(handler.isPromptingFor(buildChoiceState('tool-1'), 'tool-2')).toBe(false);
    });

    it('returns false when the input is not a CHOICE state', () => {
      const state = createFakePartial<AppState>({
        input: { inputType: CLI_INPUT_TYPES.TEXT, lines: [''], cursorLine: 0, cursorColumn: 0 },
      });
      expect(handler.isPromptingFor(state, 'tool-1')).toBe(false);
    });
  });
});
