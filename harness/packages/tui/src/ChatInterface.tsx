import React, { useEffect } from 'react';
import { Box, Static, Text, useStdout } from 'ink';
import { InputComponent } from './MessageInput';
import type {
  AppState,
  AppCallbacks,
  ChatElement,
  AgentMode,
  Message,
  PermissionMode,
  RetryStatus,
} from './types';
import type { DropdownProvider } from './lib/dropdown_provider';
import { DEFAULT_TERMINAL_WIDTH, CLI_INPUT_TYPES, ONBOARDING_CARD_ENABLED } from './constants';
import { LoadingIndicator } from './LoadingIndicator';
import { useInputAction, usePublishInputContext } from './lib/keymap';
import { useStaticReset } from './lib/hooks/use_static_reset';
import { computeStaticElements } from './lib/hooks/compute_static_elements';
import { useCancelStream, CANCEL_HINT, type CancelState } from './lib/hooks/use_cancel_stream';
import { InteractiveModeHeader } from './lib/components/InteractiveModeHeader';
import { StatusBar } from './lib/components/StatusBar';
import { McpStatusIndicator } from './lib/components/McpStatusIndicator';
import { ContextUsageIndicator } from './lib/components/ContextUsageIndicator';
import { RetryStatusIndicator } from './lib/components/RetryStatusIndicator';
import { UpdateBanner } from './lib/components/UpdateBanner';
import { DeprecationBanner, useDeprecationStatus } from './lib/components/DeprecationBanner';
import { WelcomeMessage } from './lib/components/WelcomeMessage';
import { OnboardingCard, onboardingCardVisibleForInput } from './lib/components/OnboardingCard';
import { ChatMessage } from './ChatMessage';
import { ControlsHint } from './lib/components/ControlsHint';
import { useCommandComponentRegistry } from './lib/command_component_registry';
import { resolveFooterHint } from './lib/footer_hint';
import { getAgentColor, getAgentBorderColor, getAgentPrefix } from './lib/colors';

const ESC = '\x1b';
const BEL = '\x07';
const MAX_TITLE_LENGTH = 60;

type SafeTitle = string & { readonly __brand: 'SafeTitle' };

export const truncateTitle = (content: string): SafeTitle => {
  const line = content.split('\n')[0].replaceAll(ESC, '').replaceAll(BEL, '');
  return (
    line.length > MAX_TITLE_LENGTH ? `${line.slice(0, MAX_TITLE_LENGTH - 1)}…` : line
  ) as SafeTitle;
};

export { getAgentColor };

interface AgentModeIndicatorProps {
  availableAgents: AgentMode[];
  selectedAgent: AgentMode;
}

const AgentModeIndicator: React.FC<AgentModeIndicatorProps> = ({
  availableAgents,
  selectedAgent,
}) => {
  if (availableAgents.length <= 1) return null;

  return (
    <Box>
      <Text color={getAgentColor(selectedAgent)} bold>
        {getAgentPrefix(selectedAgent)}
        {selectedAgent.toUpperCase()}{' '}
      </Text>
      <ControlsHint>{` (**tab** to switch)`}</ControlsHint>
    </Box>
  );
};

/**
 * Shown while auto mode is active so the user always knows tool calls are
 * being approved without prompting. Yellow to stand out from the agent badge.
 */
const AutoModeIndicator: React.FC<{ permissionMode?: PermissionMode }> = ({ permissionMode }) => {
  if (permissionMode !== 'auto') return null;
  return (
    <Text color="yellow" bold>
      ≫ AUTO
    </Text>
  );
};

interface StatusBarLeftProps {
  inputType: string;
  footerHint: string | null;
  availableAgents: AgentMode[];
  selectedAgent: AgentMode;
  permissionMode?: PermissionMode;
  isLoading: boolean;
  cancelState: CancelState;
  retryStatus?: RetryStatus;
  hasQueuedPrompt: boolean;
}

const StatusBarLeft: React.FC<StatusBarLeftProps> = ({
  inputType,
  footerHint,
  availableAgents,
  selectedAgent,
  permissionMode,
  isLoading,
  cancelState,
  retryStatus,
  hasQueuedPrompt,
}) => {
  if (inputType === CLI_INPUT_TYPES.CHOICE) {
    // During tool approval the agent mode indicator and tab-to-switch hint are
    // hidden (tab doesn't work while a choice is active). Show navigation
    // instructions in their place. Plain Text + literal Unicode arrows are used
    // instead of ControlsHint/Markdown so dimColor applies uniformly — bold ANSI
    // codes emitted by the Markdown renderer would otherwise override the dim.
    return <Text dimColor>Use ↑/↓ arrows to navigate • Enter to select • Ctrl+C to exit</Text>;
  }

  if (footerHint) {
    // A menu is open — replace the build/plan mode switcher with the menu's
    // navigation hint. Plain Text + dimColor is used (matching the model
    // indicator on the right) so the hint reads as secondary information.
    return <Text dimColor>{footerHint}</Text>;
  }

  return (
    <>
      <AgentModeIndicator availableAgents={availableAgents} selectedAgent={selectedAgent} />
      <AutoModeIndicator permissionMode={permissionMode} />
      {(isLoading || cancelState === 'stopped') && !hasQueuedPrompt && (
        <ControlsHint>{CANCEL_HINT[cancelState]}</ControlsHint>
      )}
      {retryStatus && <RetryStatusIndicator retryStatus={retryStatus} />}
    </>
  );
};

interface QueuedPromptIndicatorProps {
  queuedPrompt: string;
  // Esc only clears the queue in text mode; the hint would mislead otherwise
  // (e.g. while a tool-approval choice owns the input).
  canCancel: boolean;
}

const QueuedPromptIndicator: React.FC<QueuedPromptIndicatorProps> = ({
  queuedPrompt,
  canCancel,
}) => {
  // Strip ESC/BEL so a pasted control sequence cannot escape into the rendered row.
  const lines = queuedPrompt.split('\n');
  const preview = lines[0].replaceAll(ESC, '').replaceAll(BEL, '').trim();
  const moreLines = lines.length > 1 ? ` +${lines.length - 1}` : '';

  return (
    <Box>
      <Text dimColor>↳ Up next: </Text>
      <Box flexGrow={1}>
        <Text dimColor wrap="truncate">
          {preview}
          {moreLines}
        </Text>
      </Box>
      {canCancel && <Text dimColor> · Esc to cancel</Text>}
    </Box>
  );
};

interface ChatInterfaceProps {
  state: AppState;
  callbacks: AppCallbacks;
  dropdownProviders?: DropdownProvider[];
}

export const ChatInterface: React.FC<ChatInterfaceProps> = ({
  state,
  callbacks,
  dropdownProviders,
}) => {
  const [dropdownOpen, setDropdownOpen] = React.useState(false);
  const [inputEmpty, setInputEmpty] = React.useState(true);
  const commandRegistry = useCommandComponentRegistry();

  // Publish app-level facts into the central keymap context so the dispatcher
  // can arbitrate the conflict-prone keys deterministically.
  usePublishInputContext({
    inputType: state.input.inputType,
    isLoading: state.isLoading,
    hasQueuedPrompt: state.queuedPrompt !== undefined,
  });

  // Global shortcuts owned by the centralized keymap dispatcher.
  useInputAction('expand.toggle', callbacks.toggleExpanded);
  useInputAction('history.open', callbacks.onOpenHistorySearch);
  useInputAction('agent.cycle', callbacks.onCycleAgent);
  useInputAction('queue.cancel', callbacks.onCancelQueuedPrompt);
  useInputAction('app.exit', callbacks.onExit);

  const cancelState = useCancelStream(
    state.isLoading,
    state.queuedPrompt !== undefined,
    callbacks.onCancelStream,
    callbacks.onForceStop,
  );
  const footerHint = resolveFooterHint(state.input, commandRegistry, dropdownOpen);

  // Read columns here (outside <Static>) so the value is stable during live→static transitions.
  // useStdout is unavailable inside <Static>, so components rendered there must receive
  // columns as a prop rather than calling useStdout themselves.
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? DEFAULT_TERMINAL_WIDTH;
  const rows = stdout?.rows ?? 24;

  const deprecationStatus = useDeprecationStatus();
  const allDataInitialized = Boolean(
    state.username &&
      state.gitlabRemoteInfo.status !== 'not-checked' &&
      state.updateCheckResult &&
      deprecationStatus !== undefined,
  );

  const headerContent = (
    <Box key="header" marginBottom={1}>
      <InteractiveModeHeader
        username={state.username}
        credentialSource={state.credentialSource}
        gitlabRemoteInfo={state.gitlabRemoteInfo}
        cwd={state.cwd}
        agenticChatAccess={state.agenticChatAccess}
        columns={columns}
      />
    </Box>
  );

  const updateBannerContent = state.updateCheckResult?.type === 'needs-update' && (
    <UpdateBanner
      key="update-banner"
      updateInfo={state.updateCheckResult.updateInfo}
      columns={columns}
    />
  );
  const deprecationBannerContent = deprecationStatus && deprecationStatus !== 'not-applicable' && (
    <DeprecationBanner key="deprecation-banner" status={deprecationStatus} columns={columns} />
  );
  const isEmpty = state.elements.length === 0;
  const isTextInput = state.input.inputType === CLI_INPUT_TYPES.TEXT;
  // The onboarding card stays visible while the plain text prompt is active and,
  // as a special case, while the MCP panel is open — MCP is one of the onboarding
  // steps, so keeping the checklist in view reinforces that context. Every other
  // slash-command panel/dialog (/help, /model, …) hides it. Feature-flagged off
  // for now; when hidden it must not claim the input's ↑/↓ (see `onboardingActive`).
  const showOnboarding =
    isEmpty && ONBOARDING_CARD_ENABLED && onboardingCardVisibleForInput(state.input.inputType);

  const firstUserMessage = state.elements.find(
    (el): el is Message => el.type === 'message' && el.role === 'user',
  );
  const sessionTitle = firstUserMessage ? truncateTitle(firstUserMessage.content) : undefined;

  useEffect(() => {
    if (sessionTitle && process.stderr?.isTTY) {
      process.stderr.write(`${ESC}]0;${sessionTitle}${BEL}`);
      return () => {
        process.stderr.write(`${ESC}]0;${BEL}`);
      };
    }
    return undefined;
  }, [sessionTitle]);

  const staticNonce = useStaticReset(state.sessionId);
  const { useStaticOptimization, frozenElements, liveElements } = computeStaticElements(
    state.elements,
    allDataInitialized,
  );

  // Each element owns its own spacing via ChatMessage — no margin logic needed here.
  const renderElement = (element: ChatElement) => (
    <ChatMessage
      key={element.id}
      element={element}
      expanded={state.expanded}
      columns={columns}
      rows={rows}
    />
  );

  return (
    <Box flexDirection="column" height="100%">
      {/* No bottom margin during tool approval — ChoiceInput sits directly below the tool
          card with no gap, matching the visual weight of the options list. For all other
          input types a blank row separates the chat content from the input box. */}
      <Box
        flexDirection="column"
        flexGrow={1}
        marginBottom={state.input.inputType === CLI_INPUT_TYPES.CHOICE ? 0 : 1}
      >
        {useStaticOptimization ? (
          <>
            {/* Use Static for header, update banner, and frozen elements. */}
            {/* eslint-disable-next-line no-restricted-syntax */}
            <Static
              key={staticNonce}
              items={[
                headerContent,
                ...(deprecationBannerContent ? [deprecationBannerContent] : []),
                ...(updateBannerContent ? [updateBannerContent] : []),
                ...frozenElements,
              ]}
            >
              {(item) => {
                if (React.isValidElement(item)) {
                  return item;
                }
                return renderElement(item as ChatElement);
              }}
            </Static>
            {isEmpty ? (
              <>
                {showOnboarding && (
                  <OnboardingCard onRun={callbacks.onSubmit} active={inputEmpty && isTextInput} />
                )}
                <WelcomeMessage />
              </>
            ) : (
              <Box flexDirection="column">{liveElements.map(renderElement)}</Box>
            )}
          </>
        ) : (
          <>
            {headerContent}
            {deprecationBannerContent}
            {updateBannerContent}
            {isEmpty ? (
              <>
                {showOnboarding && (
                  <OnboardingCard onRun={callbacks.onSubmit} active={inputEmpty && isTextInput} />
                )}
                <WelcomeMessage />
              </>
            ) : (
              state.elements.map(renderElement)
            )}
          </>
        )}
      </Box>

      {state.isLoading && <LoadingIndicator />}
      {state.queuedPrompt !== undefined && (
        <QueuedPromptIndicator
          queuedPrompt={state.queuedPrompt.prompt}
          canCancel={state.input.inputType === CLI_INPUT_TYPES.TEXT}
        />
      )}
      <InputComponent
        input={state.input}
        callbacks={callbacks}
        dropdownProviders={dropdownProviders}
        onDropdownOpenChange={setDropdownOpen}
        onMessageEmptyChange={setInputEmpty}
        title={firstUserMessage ? sessionTitle : undefined}
        borderColor={getAgentBorderColor(state.selectedAgent)}
        promptPrefix={getAgentPrefix(state.selectedAgent)}
        onboardingActive={showOnboarding}
      />
      <StatusBar>
        <Box gap={2}>
          <StatusBarLeft
            inputType={state.input.inputType}
            footerHint={footerHint}
            availableAgents={state.availableAgents}
            selectedAgent={state.selectedAgent}
            permissionMode={state.permissionMode}
            isLoading={state.isLoading}
            cancelState={cancelState}
            retryStatus={state.retryStatus}
            hasQueuedPrompt={state.queuedPrompt !== undefined}
          />
        </Box>
        <Box gap={2}>
          <ContextUsageIndicator contextUsage={state.contextUsage} />
          <McpStatusIndicator mcpServers={state.mcpServers} />
          {/* Model stays last so it's anchored to the corner and isn't pushed
              when the context-usage indicator appears. The extra left margin
              (on top of the group gap) sets it visually apart from the
              context/MCP status so the two don't blend into one grouping. */}
          {state.selectedModel && (
            <Box marginLeft={2}>
              <Text dimColor>{state.selectedModel}</Text>
            </Box>
          )}
        </Box>
      </StatusBar>
    </Box>
  );
};
