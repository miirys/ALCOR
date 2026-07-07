import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Logo, Badge, Hint, Rule, Spinner, useTheme } from '../ui.tsx';
import { useTermSize } from '../hooks.ts';
import { sessions, SessionMeta } from '../mock/data.ts';

const ACTIONS = [
  { key: 'new', icon: '✦', label: 'New session', hint: 'start fresh in cwd' },
  { key: 'settings', icon: '⚙', label: 'Settings', hint: 'theme · model · behavior' },
  { key: 'quit', icon: '⏻', label: 'Quit', hint: 'leave the harness' },
] as const;

function StatusDot({ s }: { s: SessionMeta['status'] }) {
  const t = useTheme();
  if (s === 'running') return <Spinner kind="pulse" color={t.green} />;
  return <Text color={s === 'done' ? t.faint : t.yellow}>●</Text>;
}

function SessionRow({ s, selected }: { s: SessionMeta; selected: boolean }) {
  const t = useTheme();
  return (
    <Box flexDirection="column">
      <Box>
        <Text color={selected ? t.accent : t.faint}>{selected ? '▌ ' : '  '}</Text>
        <StatusDot s={s.status} />
        <Text color={selected ? t.bright : t.fg} bold={selected}>
          {' '}
          {s.title}
        </Text>
      </Box>
      <Box marginLeft={4}>
        <Text color={t.dim}>{s.cwd}</Text>
        <Text color={t.faint}> · </Text>
        <Text color={t.accentDim}>⎇ {s.branch}</Text>
        <Text color={t.faint}> · {s.when} · {s.turns} turns · </Text>
        <Text color={t.green}>{s.changed}Δ</Text>
      </Box>
    </Box>
  );
}

export function Menu({
  onOpen,
  onSettings,
  onQuit,
}: {
  onOpen: (s: SessionMeta | null) => void;
  onSettings: () => void;
  onQuit: () => void;
}) {
  const t = useTheme();
  const { columns, rows } = useTermSize();
  const total = sessions.length + ACTIONS.length;
  const [index, setIndex] = useState(0);

  useInput((input, key) => {
    if (key.downArrow || input === 'j') setIndex((i) => (i + 1) % total);
    if (key.upArrow || input === 'k') setIndex((i) => (i - 1 + total) % total);
    if (input === 'n') onOpen(null);
    if (input === 's') onSettings();
    if (input === 'q') onQuit();
    if (key.return) {
      if (index < sessions.length) onOpen(sessions[index]!);
      else {
        const a = ACTIONS[index - sessions.length]!;
        if (a.key === 'new') onOpen(null);
        if (a.key === 'settings') onSettings();
        if (a.key === 'quit') onQuit();
      }
    }
  });

  const inner = Math.min(columns - 4, 76);

  return (
    <Box width={columns} height={rows} flexDirection="column" alignItems="center">
      <Box flexGrow={1} />
      <Logo />
      <Box marginTop={1} marginBottom={1}>
        <Text color={t.dim}>agent harness · </Text>
        <Badge label="BETA" color={t.selBg} fg={t.accent} />
        <Text color={t.dim}> · alcor-large-2</Text>
      </Box>

      <Box flexDirection="column" width={inner}>
        <Rule width={inner} label="sessions" />
        <Box flexDirection="column" marginTop={1} rowGap={0}>
          {sessions.map((s, i) => (
            <Box key={s.id} marginBottom={i === sessions.length - 1 ? 0 : 1}>
              <SessionRow s={s} selected={index === i} />
            </Box>
          ))}
        </Box>

        <Box marginTop={1}>
          <Rule width={inner} />
        </Box>
        <Box flexDirection="column" marginTop={1}>
          {ACTIONS.map((a, i) => {
            const sel = index === sessions.length + i;
            return (
              <Box key={a.key}>
                <Text color={sel ? t.accent : t.faint}>{sel ? '▌ ' : '  '}</Text>
                <Text color={sel ? t.accent : t.dim}>{a.icon} </Text>
                <Text color={sel ? t.bright : t.fg} bold={sel}>
                  {a.label}
                </Text>
                <Text color={t.faint}>  {a.hint}</Text>
              </Box>
            );
          })}
        </Box>
      </Box>

      <Box flexGrow={1} />
      <Box width={columns - 2} justifyContent="space-between" paddingX={1}>
        <Hint
          pairs={[
            ['↑↓', 'navigate'],
            ['enter', 'open'],
            ['n', 'new'],
            ['s', 'settings'],
            ['q', 'quit'],
          ]}
        />
        <Text color={t.faint}>ALCOR α</Text>
      </Box>
    </Box>
  );
}
