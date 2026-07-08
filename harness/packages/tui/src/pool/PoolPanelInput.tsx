import React from 'react';
import { Box, Text } from 'ink';
import type { PoolPanelInputState, PoolPanelGroup } from '../types';
import { useKeyHandler } from '../lib/key_handler';
import { colors } from '../lib/colors';

export const poolPanelFooterHint = (): string | null => 'Esc Close';

export interface PoolPanelCallbacks {
  onClose: () => void;
}

const stateOf = (g: PoolPanelGroup): { text: string; color: string } => {
  if (g.exhausted) return { text: 'Exhausted', color: colors.red };
  if (g.ready) return { text: 'Ready', color: colors.green };
  return { text: 'Provisioning', color: colors.yellow };
};

const Meter: React.FC<{ used: number; cap: number }> = ({ used, cap }) => {
  const ratio = cap > 0 ? Math.min(1, used / cap) : 0;
  const filled = Math.round(ratio * 16);
  let color = colors.accentDim;
  if (ratio >= 0.88) color = colors.red;
  else if (ratio >= 0.7) color = colors.yellow;
  return (
    <Text>
      <Text color={color}>{'▰'.repeat(filled)}</Text>
      <Text color={colors.faint}>{'▱'.repeat(16 - filled)}</Text>
      <Text dimColor>
        {' '}
        {used.toFixed(2)}/{cap}
      </Text>
    </Text>
  );
};

interface PoolPanelInputProps {
  input: PoolPanelInputState;
  callbacks: PoolPanelCallbacks;
}

/** `/pool` — ALCOR panel for the pool bridge: groups, credit meters, log URL. */
export const PoolPanelInput: React.FC<PoolPanelInputProps> = ({ input, callbacks }) => {
  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;
    if (event.name === 'escape' || event.name === 'return' || (event.ctrl && event.name === 'c')) {
      callbacks.onClose();
      event.stopPropagation();
    }
  });

  return (
    <Box flexDirection="column">
      <Box
        borderStyle="round"
        borderColor={colors.borderActive}
        paddingX={2}
        paddingY={1}
        flexDirection="column"
        width={78}
      >
        <Box justifyContent="space-between" marginBottom={1}>
          <Text bold color={colors.accent}>
            ◉ Pool bridge
          </Text>
          {input.running ? (
            <Text color={colors.green}>● Running</Text>
          ) : (
            <Text color={colors.faint}>○ Not running</Text>
          )}
        </Box>

        {!input.running && (
          <Text dimColor>
            Enable it with DUOX_POOL_BRIDGE=1 to pool Duo credit groups across sessions.
          </Text>
        )}

        {input.running && (
          <Box flexDirection="column" rowGap={1}>
            <Box flexDirection="column">
              {input.groups.map((g) => {
                const st = stateOf(g);
                return (
                  <Box key={g.id}>
                    <Text color={g.active ? colors.accent : colors.faint}>
                      {g.active ? '▌ ' : '  '}
                    </Text>
                    <Box width={16}>
                      <Text color={g.active ? colors.bright : colors.fg} bold={g.active}>
                        {g.id}
                      </Text>
                    </Box>
                    <Box width={26}>
                      <Meter used={g.creditsUsed} cap={g.creditsCap} />
                    </Box>
                    <Box width={14}>
                      <Text color={st.color}> {st.text}</Text>
                    </Box>
                    {g.active && <Text dimColor>Active</Text>}
                  </Box>
                );
              })}
              {input.groups.length === 0 && (
                <Text dimColor>No standby groups yet — provisioning in background</Text>
              )}
            </Box>
            <Box flexDirection="column">
              {input.thresholdCredits !== undefined && (
                <Text>
                  <Text dimColor>Rotate at </Text>
                  <Text color={colors.fg}>
                    {input.thresholdCredits}/{input.creditsCap}
                  </Text>
                  <Text dimColor> credits</Text>
                </Text>
              )}
              {input.logUrl && (
                <Text>
                  <Text dimColor>Logs · </Text>
                  <Text color={colors.cyan}>{input.logUrl}</Text>
                </Text>
              )}
            </Box>
          </Box>
        )}
      </Box>
    </Box>
  );
};
