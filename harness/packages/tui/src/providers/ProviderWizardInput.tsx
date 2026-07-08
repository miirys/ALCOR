import React, { useState } from 'react';
import { Box, Text } from 'ink';
import type { ProviderWizardInputState, ProviderWizardProvider } from '../types';
import { useKeyHandler } from '../lib/key_handler';
import { colors } from '../lib/colors';

export const providerWizardFooterHint = (): string | null => '↑↓ Choose · Enter Select · Esc Close';

export interface ProviderWizardCallbacks {
  onSelectProvider: (id: string) => void;
  onSelectMethod: (method: 'api_key' | 'oauth') => void;
  /** API key, OAuth code/URL paste, or a custom-form field value. */
  onSubmitText: (text: string) => void;
  onSelectModel: (model: string) => void;
  onClose: () => void;
}

const TITLES: Record<ProviderWizardInputState['mode'], string> = {
  login: '❯ Login',
  logout: '× Logout',
  providers: '◈ Providers',
  custom: '+ Custom provider',
};

const CUSTOM_PROMPTS: Record<string, { label: string; hint: string }> = {
  id: { label: 'Provider name', hint: 'A short id, e.g. my-gateway' },
  baseUrl: { label: 'Base URL', hint: 'e.g. https://llm.internal.dev/v1' },
  kind: { label: 'Wire format', hint: '' },
  apiKey: { label: 'API key', hint: 'Stored in ~/.alcor/auth.json (0600)' },
};

const ProviderRow: React.FC<{ p: ProviderWizardProvider; selected: boolean }> = ({
  p,
  selected,
}) => (
  <Box>
    <Text color={selected ? colors.accent : colors.faint}>{selected ? '▌ ' : '  '}</Text>
    {p.authenticated ? <Text color={colors.green}>● </Text> : <Text color={colors.faint}>○ </Text>}
    <Box width={34}>
      <Text color={selected ? colors.bright : colors.fg} bold={selected}>
        {p.name}
      </Text>
    </Box>
    <Box width={10}>
      <Text dimColor>{p.kind}</Text>
    </Box>
    {p.active && <Text color={colors.accent}> ✓ Active</Text>}
    {p.custom && <Text dimColor> · custom</Text>}
  </Box>
);

interface ProviderWizardInputProps {
  input: ProviderWizardInputState;
  callbacks: ProviderWizardCallbacks;
}

/** Multi-step panel behind /login, /logout, /providers, /setup-custom-provider. */
export const ProviderWizardInput: React.FC<ProviderWizardInputProps> = ({ input, callbacks }) => {
  const [row, setRow] = useState(0);
  const [text, setText] = useState('');

  const isTextStep =
    input.step === 'api_key' ||
    input.step === 'oauth_wait' ||
    (input.step === 'custom_form' && input.customField !== 'kind');
  const masked = input.step === 'api_key' || input.customField === 'apiKey';

  let listLength = 0;
  if (input.step === 'provider') listLength = input.providers.length;
  else if (input.step === 'method') listLength = 2;
  else if (input.step === 'model') listLength = input.models?.length ?? 0;
  else if (input.step === 'custom_form' && input.customField === 'kind') listLength = 2;

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (event.name === 'escape') {
      callbacks.onClose();
      event.stopPropagation();
      return;
    }
    if (event.name === 'return') {
      if (input.step === 'provider' && input.providers[row]) {
        callbacks.onSelectProvider(input.providers[row].id);
        setRow(0);
      } else if (input.step === 'method') {
        callbacks.onSelectMethod(row === 0 ? 'oauth' : 'api_key');
        setRow(0);
      } else if (input.step === 'model' && input.models?.[row]) {
        callbacks.onSelectModel(input.models[row]);
        setRow(0);
      } else if (input.step === 'custom_form' && input.customField === 'kind') {
        callbacks.onSubmitText(row === 0 ? 'openai' : 'anthropic');
        setRow(0);
      } else if (isTextStep) {
        callbacks.onSubmitText(text);
        setText('');
      } else if (input.step === 'done') {
        callbacks.onClose();
      }
      event.stopPropagation();
      return;
    }
    if (event.name === 'up' && listLength > 0) {
      setRow((r) => Math.max(0, r - 1));
      event.stopPropagation();
      return;
    }
    if (event.name === 'down' && listLength > 0) {
      setRow((r) => Math.min(listLength - 1, r + 1));
      event.stopPropagation();
      return;
    }
    if (isTextStep) {
      if (event.name === 'backspace' || event.name === 'delete') {
        setText((t) => t.slice(0, -1));
        event.stopPropagation();
        return;
      }
      if (event.name === 'paste' && event.sequence) {
        setText((t) => t + event.sequence.replaceAll(/[\r\n]+/g, ''));
        event.stopPropagation();
        return;
      }
      if (event.sequence && event.sequence.length === 1 && !event.ctrl && !event.meta) {
        setText((t) => t + event.sequence);
        event.stopPropagation();
      }
    }
  });

  const methodRows = ['Browser login (Claude Pro/Max subscription)', 'API key'];
  const kindRows = ['OpenAI-compatible (chat/completions)', 'Anthropic-compatible (messages)'];

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={colors.borderActive}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        width={86}
      >
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold color={colors.accent}>
            {TITLES[input.mode]}
          </Text>
          <Text dimColor>~/.alcor</Text>
        </Box>

        {input.step === 'provider' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text dimColor>
                {input.mode === 'logout'
                  ? 'Choose the provider to sign out of.'
                  : 'Choose a provider. GitLab Duo stays available as the fallback.'}
              </Text>
            </Box>
            {input.providers.map((p, i) => (
              <ProviderRow key={p.id} p={p} selected={i === row} />
            ))}
            {input.providers.length === 0 && <Text dimColor>Nothing here yet.</Text>}
          </Box>
        )}

        {input.step === 'method' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text dimColor>How do you want to authenticate?</Text>
            </Box>
            {methodRows.map((label, i) => (
              <Box key={label}>
                <Text color={i === row ? colors.accent : colors.faint}>
                  {i === row ? '▌ ' : '  '}
                </Text>
                <Text color={i === row ? colors.bright : colors.fg} bold={i === row}>
                  {label}
                </Text>
              </Box>
            ))}
          </Box>
        )}

        {input.step === 'custom_form' && input.customField === 'kind' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text dimColor>Which wire format does the endpoint speak?</Text>
            </Box>
            {kindRows.map((label, i) => (
              <Box key={label}>
                <Text color={i === row ? colors.accent : colors.faint}>
                  {i === row ? '▌ ' : '  '}
                </Text>
                <Text color={i === row ? colors.bright : colors.fg} bold={i === row}>
                  {label}
                </Text>
              </Box>
            ))}
          </Box>
        )}

        {input.step === 'oauth_wait' && (
          <Box flexDirection="column" rowGap={1}>
            <Text dimColor>Open this URL in your browser to authorize ALCOR:</Text>
            <Text color={colors.cyan} wrap="wrap">
              {input.oauthUrl}
            </Text>
            <Text dimColor>
              Waiting for the browser callback… or paste the redirect URL / code below:
            </Text>
            <Box>
              <Text color={colors.accent}>❯ </Text>
              <Text color={colors.fg}>{text}</Text>
              <Text color={colors.accent}>█</Text>
            </Box>
          </Box>
        )}

        {input.step === 'api_key' && (
          <Box flexDirection="column" rowGap={1}>
            <Text dimColor>Paste your API key. It is stored in ~/.alcor/auth.json (0600).</Text>
            <Box>
              <Text color={colors.accent}>❯ </Text>
              <Text color={colors.fg}>{'•'.repeat(text.length)}</Text>
              <Text color={colors.accent}>█</Text>
            </Box>
          </Box>
        )}

        {input.step === 'custom_form' && input.customField && input.customField !== 'kind' && (
          <Box flexDirection="column" rowGap={1}>
            <Text>
              <Text dimColor>{CUSTOM_PROMPTS[input.customField].label} </Text>
              <Text color={colors.faint}>{CUSTOM_PROMPTS[input.customField].hint}</Text>
            </Text>
            <Box>
              <Text color={colors.accent}>❯ </Text>
              <Text color={colors.fg}>{masked ? '•'.repeat(text.length) : text}</Text>
              <Text color={colors.accent}>█</Text>
            </Box>
          </Box>
        )}

        {input.step === 'model' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text dimColor>
                {input.models?.length ?? 0} models discovered — pick the default:
              </Text>
            </Box>
            {(input.models ?? []).slice(0, 14).map((m, i) => (
              <Box key={m}>
                <Text color={i === row ? colors.accent : colors.faint}>
                  {i === row ? '▌ ' : '  '}
                </Text>
                <Text color={i === row ? colors.bright : colors.fg} bold={i === row}>
                  {m}
                </Text>
              </Box>
            ))}
            {(input.models?.length ?? 0) > 14 && (
              <Text dimColor>… {(input.models?.length ?? 0) - 14} more (top 14 shown)</Text>
            )}
          </Box>
        )}

        {input.step === 'busy' && (
          <Text>
            <Text color={colors.accentDim}>✦ </Text>
            <Text dimColor>{input.message ?? 'Working…'}</Text>
          </Text>
        )}

        {input.step === 'done' && (
          <Box flexDirection="column">
            <Text color={input.isError ? colors.red : colors.green}>
              {input.isError ? '✗ ' : '✓ '}
              {input.message}
            </Text>
            <Box marginTop={1}>
              <Text dimColor>Enter / Esc to close</Text>
            </Box>
          </Box>
        )}

        {input.message && input.step !== 'done' && input.step !== 'busy' && (
          <Box marginTop={1}>
            <Text color={input.isError ? colors.red : colors.dim}>{input.message}</Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
