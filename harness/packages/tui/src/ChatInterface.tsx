import React, { useContext, useEffect } from 'react';
import { Box, Text, useStdout } from 'ink';
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
import { DEFAULT_TERMINAL_WIDTH, CLI_INPUT_TYPES } from './constants';
import { LoadingIndicator } from './LoadingIndicator';
import { useInputAction, usePublishInputContext } from './lib/keymap';
import { useCancelStream, CANCEL_HINT, type CancelState } from './lib/hooks/use_cancel_stream';
import { StatusBar } from './lib/components/StatusBar';
import { McpStatusIndicator } from './lib/components/McpStatusIndicator';
import { RetryStatusIndicator } from './lib/components/RetryStatusIndicator';
import { UpdateBanner } from './lib/components/UpdateBanner';
import { DeprecationBanner, useDeprecationStatus } from './lib/components/DeprecationBanner';
import { TopBar, Hero, Splash, SessionSidebar } from './lib/components/AlcorChrome';
import { useKeyHandler } from './lib/key_handler';
import { ChatMessage } from './ChatMessage';
import { ControlsHint } from './lib/components/ControlsHint';
import { useCommandComponentRegistry } from './lib/command_component_registry';
import { resolveFooterHint } from './lib/footer_hint';
import { getAgentColor, getAgentBorderColor, getAgentPrefix, colors } from './lib/colors';
import { EnvironmentContext } from './lib/environment_context';

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
  /** Hide the key hints (a busy indicator occupies their slot). */
  compact?: boolean;
}

const AgentModeIndicator: React.FC<AgentModeIndicatorProps> = ({
  availableAgents,
  selectedAgent,
  compact,
}) => {
  if (availableAgents.length <= 1) return null;

  return (
    <Box>
      <Text color={getAgentColor(selectedAgent)} bold>
        {getAgentPrefix(selectedAgent)}
        {selectedAgent.toUpperCase()}
      </Text>
      {/* While a stream is active the cancel hint takes this slot — showing
          both wraps the footer on narrow terminals. */}
      {!compact && (
        <>
          <Text> </Text>
          <ControlsHint>{`**Tab** Mode · **/** Commands · **Ctrl+B** Sidebar · **Ctrl+O** Expand`}</ControlsHint>
        </>
      )}
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
    return <Text dimColor>↑↓ Navigate · Enter Select · Ctrl+C Exit</Text>;
  }

  if (footerHint) {
    // A menu is open — replace the build/plan mode switcher with the menu's
    // navigation hint. Plain Text + dimColor is used (matching the model
    // indicator on the right) so the hint reads as secondary information.
    return <Text dimColor>{footerHint}</Text>;
  }

  return (
    <>
      <AgentModeIndicator
        availableAgents={availableAgents}
        selectedAgent={selectedAgent}
        compact={isLoading || cancelState === 'stopped'}
      />
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

/**
 * Rough row-height estimate for a chat element at the given width. Used to
 * slice the transcript from the tail so the whole frame fits the terminal —
 * ALCOR renders a session *screen*, not an append-only scroll log.
 * Over-estimating is safe (fewer elements shown); under-estimating spills
 * frames into scrollback.
 */
const estimateRows = (el: ChatElement, width: number): number => {
  const wrap = (s: string, w: number): number =>
    s.split('\n').reduce((acc, line) => acc + Math.max(1, Math.ceil((line.length || 1) / w)), 0);
  if (el.type === 'message') {
    if (el.role === 'assistant' && !el.content) return 0;
    return wrap(el.content, Math.max(20, Math.min(width, 118) - 2)) + 1;
  }
  if (el.type === 'error') return 4;
  if (el.type === 'info') return 3;
  // Tool cards: label row + truncated body; diffs and shell previews are taller.
  const t = el.input.tool;
  let body = 7;
  if (t === 'edit_file' || t === 'create_file_with_contents') body = 15;
  else if (t === 'run_command' || t === 'shell_command') body = 14;
  return body + 1;
};

/** Last N elements whose estimated heights fit the budget (always ≥ 1). */
const sliceTail = (elements: ChatElement[], budget: number, width: number): ChatElement[] => {
  const out: ChatElement[] = [];
  let used = 0;
  for (let i = elements.length - 1; i >= 0; i--) {
    const h = estimateRows(elements[i], width);
    if (out.length > 0 && used + h > budget) break;
    out.unshift(elements[i]);
    used += h;
  }
  return out;
};

const SIDEBAR_WIDTH = 34;

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
  const [, setInputEmpty] = React.useState(true);
  const [sidebarVisible, setSidebarVisible] = React.useState(true);
  const commandRegistry = useCommandComponentRegistry();
  const envInfo = useContext(EnvironmentContext);

  // Ctrl+B toggles the session sidebar, matching the ALCOR footer hint.
  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;
    if (event.ctrl && event.name === 'b') {
      setSidebarVisible((v) => !v);
      event.stopPropagation();
    }
  });

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

  const { stdout } = useStdout();
  const columns = stdout?.columns ?? DEFAULT_TERMINAL_WIDTH;
  const rows = stdout?.rows ?? 24;

  const deprecationStatus = useDeprecationStatus();

  const isEmpty = state.elements.length === 0;
  const isTextInput = state.input.inputType === CLI_INPUT_TYPES.TEXT;
  const isChoiceInput = state.input.inputType === CLI_INPUT_TYPES.CHOICE;
  const dialogOpen = !isTextInput && !isChoiceInput;

  const initializing =
    !state.username ||
    state.gitlabRemoteInfo.status === 'not-checked' ||
    !state.agenticChatAccess ||
    state.agenticChatAccess.status === 'checking';

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

  // Frame budget: top bar (1) + blank (1) + input panel (3-4) + status (1) +
  // loading/queued (2) ≈ 9 rows of chrome; dialogs claim extra vertical space.
  const bodyBudget = Math.max(5, rows - 9 - (dialogOpen ? 12 : 0));
  const showSidebar = sidebarVisible && !isEmpty && columns >= 130 && !dialogOpen;
  const mainWidth = showSidebar ? columns - SIDEBAR_WIDTH - 1 : columns;
  const visible = sliceTail(state.elements, bodyBudget, mainWidth);

  const updateBannerContent = state.updateCheckResult?.type === 'needs-update' && (
    <UpdateBanner updateInfo={state.updateCheckResult.updateInfo} columns={columns} />
  );
  const deprecationBannerContent = deprecationStatus && deprecationStatus !== 'not-applicable' && (
    <DeprecationBanner status={deprecationStatus} columns={columns} />
  );

  return (
    <Box flexDirection="column" width={columns} height={rows}>
      {isEmpty ? (
        !state.username ? (
          <Splash version={envInfo.duoCliVersion} model={state.selectedModel} />
        ) : (
          <Hero
            version={envInfo.duoCliVersion}
            username={state.username}
            credentialSource={state.credentialSource}
            agenticChatAccess={state.agenticChatAccess}
            gitlabRemoteInfo={state.gitlabRemoteInfo}
            cwd={state.cwd}
            initializing={initializing}
          />
        )
      ) : (
        <TopBar
          cwd={state.cwd}
          gitlabRemoteInfo={state.gitlabRemoteInfo}
          contextUsage={state.contextUsage}
          columns={columns}
        />
      )}
      {deprecationBannerContent}
      {updateBannerContent}

      <Box
        marginBottom={isChoiceInput ? 0 : 1}
        marginTop={isEmpty ? 0 : 1}
        flexGrow={1}
        overflow="hidden"
      >
        <Box flexDirection="column" width={mainWidth} paddingX={1} overflow="hidden">
          {visible.map((element) => (
            <ChatMessage
              key={element.id}
              element={element}
              expanded={state.expanded}
              columns={mainWidth - 2}
              rows={rows}
            />
          ))}
        </Box>
        {showSidebar && (
          <SessionSidebar
            elements={state.elements}
            contextUsage={state.contextUsage}
            mcpServers={state.mcpServers}
            width={SIDEBAR_WIDTH}
            height={Math.max(8, bodyBudget)}
          />
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
        onboardingActive={false}
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
          <McpStatusIndicator mcpServers={state.mcpServers} />
          <Text dimColor>
            {state.selectedModel ? `${state.selectedModel} · ` : ''}
            <Text color={colors.faint}>ALCOR α</Text>
          </Text>
        </Box>
      </StatusBar>
    </Box>
  );
};
