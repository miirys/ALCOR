import { createInterfaceId, Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import { SecretRedactor } from '@gitlab-org/secret-redaction';
import {
  CLI_INPUT_TYPES,
  type AppState,
  type ApprovalScope,
  type ChoiceOption,
  type ToolCall,
} from '@gitlab-org/tui';
import { DuoAgentPlatformEvent, DuoAgentPlatformTracker } from '@gitlab-org/telemetry';
import { type AgentMode, type ToolApprovalAction, UserActionType } from '../../backend/backend';
import type { ControllerApi } from './controller_api';

const MAX_REJECTION_REASON_LENGTH = 500;

export interface ToolApprovalCallbacks {
  onSubmitRejectionReason: (reason: string) => void;
  onCancelRejectionReason: () => void;
}

export interface ToolApprovalHandler {
  presentApprovalChoices(api: ControllerApi, toolCalls: ToolCall[], agentMode?: AgentMode): void;
  handleChoiceSubmit(api: ControllerApi, action: ToolApprovalAction): void;
  getCallbacks(api: ControllerApi): ToolApprovalCallbacks;
  isPromptingFor(state: AppState, toolId: string): boolean;
  /**
   * Approves all pending tool calls without prompting (auto mode). Follows the
   * exact same submission path as a user pressing "Approve" on the first tool
   * of a parallel batch: the first approval is submitted and the rest are
   * drained from the queue with the same decision.
   */
  autoApproveAll(api: ControllerApi, toolCalls: ToolCall[], agentMode?: AgentMode): void;
}

export const ToolApprovalHandler = createInterfaceId<ToolApprovalHandler>('ToolApprovalHandler');

@Implements(ToolApprovalHandler)
@Service({
  dependencies: [Logger, SecretRedactor, DuoAgentPlatformTracker],
  lifetime: ServiceLifetime.Singleton,
})
export class DefaultToolApprovalHandler implements ToolApprovalHandler {
  #logger: Logger;

  #secretRedactor: SecretRedactor;

  #tracker: DuoAgentPlatformTracker;

  #lastAvailableScopes: ApprovalScope[] = [];

  #lastSuggestedPatterns: string[] | undefined;

  #pendingRejection:
    | {
        toolId: string;
        toolName: string;
        agentMode?: AgentMode;
        toolArgs?: Record<string, unknown>;
        availableScopes: ApprovalScope[];
        suggestedPatterns?: string[];
      }
    | undefined;

  #approvalQueue: { toolCall: ToolCall; agentMode?: AgentMode }[] = [];

  constructor(logger: Logger, secretRedactor: SecretRedactor, tracker: DuoAgentPlatformTracker) {
    this.#logger = withPrefix(logger, '[ToolApprovalHandler]');
    this.#secretRedactor = secretRedactor;
    this.#tracker = tracker;
  }

  presentApprovalChoices(api: ControllerApi, toolCalls: ToolCall[], agentMode?: AgentMode): void {
    if (toolCalls.length === 0) return;

    this.#pendingRejection = undefined;
    this.#approvalQueue = [];

    // Queue all tools after the first
    for (const toolCall of toolCalls.slice(1)) {
      this.#approvalQueue.push({ toolCall, agentMode });
    }

    this.#presentSingleApproval(api, toolCalls[0], agentMode);
  }

  #presentSingleApproval(api: ControllerApi, toolCall: ToolCall, agentMode?: AgentMode): void {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tool: _tool, ...toolArgs } = toolCall.input || {};

    // Extract available scopes from toolCall state, default to 'once' only (conservative)
    const availableScopes: ApprovalScope[] =
      toolCall.state.type === 'approval_request' ? toolCall.state.availableScopes : ['once'];

    const suggestedPatterns =
      toolCall.state.type === 'approval_request' ? toolCall.state.suggestedPatterns : undefined;

    this.#lastAvailableScopes = availableScopes;
    this.#lastSuggestedPatterns = suggestedPatterns;

    this.#setChoiceState(
      api,
      toolCall.id,
      toolCall.name,
      agentMode,
      toolArgs,
      availableScopes,
      suggestedPatterns,
    );
  }

  autoApproveAll(api: ControllerApi, toolCalls: ToolCall[], agentMode?: AgentMode): void {
    if (toolCalls.length === 0) return;

    this.#pendingRejection = undefined;
    this.#approvalQueue = toolCalls.slice(1).map((toolCall) => ({ toolCall, agentMode }));

    const first = toolCalls[0];
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { tool: _tool, ...toolArgs } = first.input || {};

    this.#logger.info(`Auto mode: approving ${toolCalls.length} pending tool call(s)`);

    // Reuse handleChoiceSubmit so telemetry and queue-draining semantics are
    // identical to a manual "Approve" on the first tool of the batch.
    this.handleChoiceSubmit(api, {
      type: UserActionType.SendToolApproval,
      toolId: first.id,
      toolName: first.name,
      agentMode,
      toolArgs,
      approved: true,
      scope: 'once',
    });
  }

  handleChoiceSubmit(api: ControllerApi, action: ToolApprovalAction): void {
    if (action.approved) {
      this.#tracker.trackEvent(DuoAgentPlatformEvent.ToolApprovalSubmitted, {
        source: 'cli',
        toolName: action.toolName,
        approvalScope: action.scope,
      });
      api.sendToolApproval(action);
      // Auto-approve all remaining queued tools with the same decision —
      // the user approved the whole parallel batch at once.
      this.#drainQueueWithApproval(api, action);
      return;
    }

    this.#pendingRejection = {
      toolId: action.toolId,
      toolName: action.toolName,
      agentMode: action.agentMode,
      toolArgs: action.toolArgs,
      availableScopes: this.#lastAvailableScopes,
      suggestedPatterns: this.#lastSuggestedPatterns,
    };
    this.#logger.debug(`Requesting rejection reason for tool: ${action.toolName}`);

    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.TOOL_REJECTION_REASON,
        toolName: action.toolName,
      },
    }));
  }

  /**
   * Auto-approves (or rejects) all remaining queued tools using the same
   * scope/decision as the action just submitted. Called after the user
   * approves or rejects the first tool in a parallel batch so they only
   * need to respond once.
   */
  #drainQueueWithApproval(api: ControllerApi, action: ToolApprovalAction): void {
    let next = this.#approvalQueue.shift();
    while (next) {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { tool: _tool, ...toolArgs } = next.toolCall.input || {};
      if (action.approved) {
        this.#tracker.trackEvent(DuoAgentPlatformEvent.ToolApprovalSubmitted, {
          source: 'cli',
          toolName: next.toolCall.name,
          approvalScope: action.scope,
        });
        api.sendToolApproval({
          type: UserActionType.SendToolApproval,
          toolId: next.toolCall.id,
          toolName: next.toolCall.name,
          agentMode: next.agentMode,
          toolArgs,
          approved: true,
          scope: action.scope,
        });
      } else {
        api.sendToolApproval({
          type: UserActionType.SendToolApproval,
          toolId: next.toolCall.id,
          toolName: next.toolCall.name,
          agentMode: next.agentMode,
          toolArgs,
          approved: false,
          rejectionReason: action.rejectionReason,
        });
      }
      next = this.#approvalQueue.shift();
    }
  }

  getCallbacks(api: ControllerApi): ToolApprovalCallbacks {
    return {
      onSubmitRejectionReason: (reason: string) => {
        const pending = this.#pendingRejection;
        if (!pending) {
          this.#logger.warn('onSubmitRejectionReason called without pending rejection');
          return;
        }

        const redactedReason = this.#secretRedactor.redactSecrets(reason, 'user-input');
        const trimmedReason =
          redactedReason.trim().slice(0, MAX_REJECTION_REASON_LENGTH) || undefined;
        this.#pendingRejection = undefined;

        this.#logger.debug(
          `Rejecting tool ${pending.toolName} (${pending.toolId})${trimmedReason ? ' with reason' : ''}`,
        );

        const rejectionAction: ToolApprovalAction = {
          type: UserActionType.SendToolApproval,
          toolId: pending.toolId,
          toolName: pending.toolName,
          agentMode: pending.agentMode,
          toolArgs: pending.toolArgs,
          approved: false,
          rejectionReason: trimmedReason,
        };
        api.sendToolApproval(rejectionAction);
        this.#drainQueueWithApproval(api, rejectionAction);
      },

      onCancelRejectionReason: () => {
        const pending = this.#pendingRejection;
        if (!pending) {
          this.#logger.warn('onCancelRejectionReason called without pending rejection');
          return;
        }

        this.#logger.debug('Cancelled rejection reason input, returning to choice');
        this.#pendingRejection = undefined;
        this.#setChoiceState(
          api,
          pending.toolId,
          pending.toolName,
          pending.agentMode,
          pending.toolArgs,
          pending.availableScopes,
          pending.suggestedPatterns,
        );
      },
    };
  }

  isPromptingFor(state: AppState, toolId: string): boolean {
    if (state.input.inputType !== CLI_INPUT_TYPES.CHOICE) return false;
    const firstOption = state.input.choiceOptions[0]?.value as ToolApprovalAction | undefined;
    return firstOption?.toolId === toolId;
  }

  #setChoiceState(
    api: ControllerApi,
    toolId: string,
    toolName: string,
    agentMode?: AgentMode,
    toolArgs?: Record<string, unknown>,
    availableScopes?: ApprovalScope[],
    suggestedPatterns?: string[],
  ): void {
    const message = {
      type: UserActionType.SendToolApproval,
      toolId,
      toolName,
      agentMode,
      toolArgs,
    } as const;

    const choiceOptions: ChoiceOption<ToolApprovalAction>[] = [
      { label: 'Approve', value: { ...message, approved: true, scope: 'once' } },
    ];

    // Simply check if 'session' is in available scopes - no capability logic needed!
    if (availableScopes?.includes('session')) {
      choiceOptions.push({
        label: 'Approve for session',
        value: { ...message, approved: true, scope: 'session' },
      });

      // Add pattern-based approval options when suggested by the backend
      if (suggestedPatterns && suggestedPatterns.length > 0) {
        for (const pattern of suggestedPatterns) {
          choiceOptions.push({
            label: 'Approve for session:',
            secondaryLabel: pattern,
            value: { ...message, approved: true, scope: 'session', pattern },
          });
        }
      }
    }

    choiceOptions.push({
      label: 'Reject',
      value: { ...message, approved: false },
    });

    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.CHOICE,
        choiceOptions,
        selectedChoiceIndex: 0,
      },
    }));
  }
}
