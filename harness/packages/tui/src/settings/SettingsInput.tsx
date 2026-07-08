import React, { useState } from 'react';
import { Box, Text } from 'ink';
import type { SettingsInputState, SettingsItem, SettingsOption } from '../types';
import { ConnectionState } from '../types';
import { useKeyHandler } from '../lib/key_handler';
import { colors } from '../lib/colors';
import { themes, setTheme, getThemeId } from '../lib/themes';

const TABS = ['Appearance', 'Behavior', 'Stats', 'MCP', 'Keys'] as const;
type Tab = (typeof TABS)[number];

export const settingsFooterHint = (): string | null =>
  '←→ Tab · ↑↓ Row · Enter/Space Apply · Esc Close';

export interface SettingsCallbacks {
  onToggle: (key: string) => void;
  /** Select a value for a non-boolean selector item. */
  onSelect?: (key: string, value: string) => void;
  onClose: () => void;
}

/** Returns the option value after `current`, wrapping around to the first. */
const nextOptionValue = (options: SettingsOption[], current: string | undefined): string => {
  const index = options.findIndex((option) => option.value === current);
  return options[(index + 1) % options.length].value;
};

/** The label shown on the right of an item: the selected option, or on/off for toggles. */
const itemStatus = (item: SettingsItem): { text: string; color: string } => {
  if (item.options) {
    const selected = item.options.find((option) => option.value === item.value);
    return { text: selected?.label ?? item.value, color: colors.cyan };
  }
  return item.enabled
    ? { text: '◉ on', color: colors.green }
    : { text: '○ off', color: colors.faint };
};

const KEYS: [string, string][] = [
  ['Tab', 'Cycle Build / Plan mode'],
  ['Ctrl+B', 'Toggle sidebar'],
  ['Ctrl+O', 'Expand / fold tool traces'],
  ['Ctrl+R', 'Search prompt history'],
  ['Esc', 'Cancel stream · close panel'],
  ['Ctrl+C', 'Clear input / exit'],
  ['/', 'Command palette'],
  ['@', 'Attach files'],
];

/** Horizontal meter built from block glyphs. */
const Bar: React.FC<{ value: number; width: number; color: string }> = ({
  value,
  width,
  color,
}) => (
  <Text>
    <Text color={color}>{'▰'.repeat(Math.round(value * width))}</Text>
    <Text color={colors.faint}>{'▱'.repeat(Math.max(0, width - Math.round(value * width)))}</Text>
  </Text>
);

const fmtTokens = (n?: number): string => {
  if (n === undefined) return '—';
  return n >= 1000 ? `${Math.round(n / 100) / 10}k` : String(n);
};

interface SettingsInputProps {
  input: SettingsInputState;
  callbacks: SettingsCallbacks;
}

export const SettingsInput: React.FC<SettingsInputProps> = ({ input, callbacks }) => {
  const [tab, setTab] = useState<Tab>(input.initialTab ?? 'Appearance');
  const [row, setRow] = useState(0);
  const [, bump] = useState(0);

  let rowsMax = 1;
  if (tab === 'Appearance') rowsMax = themes.length;
  else if (tab === 'Behavior') rowsMax = input.items.length;
  else if (tab === 'Keys') rowsMax = KEYS.length;

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (event.name === 'escape' || (event.ctrl && event.name === 'c')) {
      callbacks.onClose();
      event.stopPropagation();
      return;
    }
    if (event.name === 'left') {
      setTab((t) => TABS[(TABS.indexOf(t) + TABS.length - 1) % TABS.length]);
      setRow(0);
      event.stopPropagation();
      return;
    }
    if (event.name === 'right' || event.name === 'tab') {
      setTab((t) => TABS[(TABS.indexOf(t) + 1) % TABS.length]);
      setRow(0);
      event.stopPropagation();
      return;
    }
    if (event.name === 'return' || event.name === 'space') {
      if (tab === 'Appearance') {
        setTheme(themes[row].id);
        bump((v) => v + 1);
      } else if (tab === 'Behavior') {
        const item = input.items[row];
        if (item?.options) {
          callbacks.onSelect?.(item.key, nextOptionValue(item.options, item.value));
        } else if (item) {
          callbacks.onToggle(item.key);
        }
      }
      event.stopPropagation();
      return;
    }
    if (event.name === 'up' && row > 0) {
      setRow(row - 1);
      event.stopPropagation();
      return;
    }
    if (event.name === 'down' && row < rowsMax - 1) {
      setRow(row + 1);
      event.stopPropagation();
    }
  });

  const { stats } = input;
  const maxTool = stats?.toolCounts[0]?.count ?? 1;

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
            ◈ Settings
          </Text>
          <Text dimColor>Changes apply live</Text>
        </Box>

        <Box columnGap={1} marginBottom={1}>
          {TABS.map((t) => (
            <Text key={t}>
              {t === tab ? (
                <Text color={colors.accent} bold>
                  {` ${t} `}
                </Text>
              ) : (
                <Text dimColor>{` ${t} `}</Text>
              )}
            </Text>
          ))}
        </Box>
        <Box marginBottom={1}>
          <Text color={colors.faint}>{'─'.repeat(80)}</Text>
        </Box>

        {tab === 'Appearance' && (
          <Box flexDirection="column">
            <Box marginBottom={1}>
              <Text dimColor>
                The default is monochrome — color is reserved for diffs, state, and markers.
              </Text>
            </Box>
            {themes.map((th, i) => (
              <Box key={th.id}>
                <Text color={i === row ? colors.accent : colors.faint}>
                  {i === row ? '▌ ' : '  '}
                </Text>
                <Box width={16}>
                  <Text color={i === row ? colors.bright : colors.fg} bold={i === row}>
                    {th.name}
                  </Text>
                </Box>
                <Text>
                  <Text color={th.accent}>████</Text>
                  <Text color={th.accentDim}>██</Text>
                  <Text color={colors.green}>█</Text>
                  <Text color={colors.red}>█</Text>
                  <Text color={colors.yellow}>█</Text>
                </Text>
                {th.id === getThemeId() && <Text color={colors.green}> ✓ Active</Text>}
              </Box>
            ))}
          </Box>
        )}

        {tab === 'Behavior' && (
          <Box flexDirection="column">
            {input.items.map((item, index) => {
              const isSelected = index === row;
              const status = itemStatus(item);
              return (
                <Box key={item.key} gap={1}>
                  <Text color={isSelected ? colors.accent : colors.faint}>
                    {isSelected ? '▌' : ' '}
                  </Text>
                  <Box width={28}>
                    <Text bold={isSelected} color={isSelected ? colors.bright : colors.fg}>
                      {item.label}
                    </Text>
                  </Box>
                  <Text color={status.color}>{status.text}</Text>
                </Box>
              );
            })}
            {input.items[row] && (
              <Box marginTop={1}>
                <Text dimColor>{input.items[row].description}</Text>
              </Box>
            )}
          </Box>
        )}

        {tab === 'Stats' && (
          <Box flexDirection="column" rowGap={1}>
            <Box columnGap={4}>
              {(
                [
                  ['Sessions', stats?.sessions !== undefined ? String(stats.sessions) : '—'],
                  ['Turns', stats ? String(stats.turns) : '—'],
                  ['Tokens', fmtTokens(stats?.tokensUsed)],
                  ['Window', fmtTokens(stats?.tokensMax)],
                ] as const
              ).map(([k, v]) => (
                <Box key={k} flexDirection="column">
                  <Text dimColor>{k}</Text>
                  <Text color={colors.bright} bold>
                    {v}
                  </Text>
                </Box>
              ))}
            </Box>
            {stats?.tokensUsed !== undefined && stats.tokensMax ? (
              <Box flexDirection="column">
                <Text dimColor>Context window</Text>
                <Bar
                  value={Math.min(1, stats.tokensUsed / stats.tokensMax)}
                  width={32}
                  color={colors.accent}
                />
              </Box>
            ) : null}
            <Box flexDirection="column">
              <Text dimColor>Tool invocations · This session</Text>
              {(stats?.toolCounts ?? []).slice(0, 8).map((t) => (
                <Box key={t.name}>
                  <Box width={14}>
                    <Text color={colors.fg}>{t.name}</Text>
                  </Box>
                  <Bar value={t.count / maxTool} width={20} color={colors.accentDim} />
                  <Text dimColor> {t.count}</Text>
                </Box>
              ))}
              {(!stats || stats.toolCounts.length === 0) && <Text dimColor>No tool calls yet</Text>}
            </Box>
            {stats?.model && (
              <Text>
                <Text dimColor>Model · </Text>
                <Text color={colors.fg}>{stats.model}</Text>
              </Text>
            )}
          </Box>
        )}

        {tab === 'MCP' && (
          <Box flexDirection="column">
            {(input.mcpServers ?? []).map((s) => (
              <Box key={s.name}>
                {s.connectionState === ConnectionState.Connected ? (
                  <Text color={colors.green}>● </Text>
                ) : (
                  <Text color={colors.red}>○ </Text>
                )}
                <Box width={20}>
                  <Text color={colors.fg}>{s.name}</Text>
                </Box>
                <Text dimColor>
                  {s.connectionState === ConnectionState.Connected ? 'Healthy' : 'Unreachable'}
                </Text>
              </Box>
            ))}
            {(input.mcpServers ?? []).length === 0 && (
              <Text dimColor>No MCP servers configured · /mcp manages servers</Text>
            )}
          </Box>
        )}

        {tab === 'Keys' && (
          <Box flexDirection="column">
            {KEYS.map(([k, d], i) => (
              <Box key={k}>
                <Text color={i === row ? colors.accent : colors.faint}>
                  {i === row ? '▌ ' : '  '}
                </Text>
                <Box width={10}>
                  <Text color={colors.accent}>{k}</Text>
                </Box>
                <Text dimColor>{d}</Text>
              </Box>
            ))}
          </Box>
        )}
      </Box>
    </Box>
  );
};
