import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Hint, Rule, useTheme } from '../ui.tsx';
import { useTermSize } from '../hooks.ts';
import { themes } from '../theme.ts';

const TABS = ['appearance', 'model', 'behavior', 'keys'] as const;
type Tab = (typeof TABS)[number];

import { models as MODELS } from '../mock/data.ts';

const BEHAVIOR = [
  { k: 'auto-approve edits', v: 'off', desc: 'apply file edits without confirmation' },
  { k: 'verify after change', v: 'on', desc: 'run project verify skill post-edit' },
  { k: 'turn timer', v: 'on', desc: 'print "turn completed in Xs"' },
  { k: 'context warnings', v: '80%', desc: 'warn when context passes threshold' },
  { k: 'mouse support', v: 'on', desc: 'click to fold traces, scroll transcript' },
  { k: 'telemetry', v: 'off', desc: 'nothing leaves this machine' },
];

const KEYS = [
  ['shift+tab', 'cycle mode'],
  ['ctrl+b', 'sidebar'],
  ['ctrl+d', 'diff review'],
  ['ctrl+o', 'fold / unfold'],
  ['ctrl+l', 'clear'],
  ['?', 'shortcut overlay'],
];

function Toggle({ v }: { v: string }) {
  const t = useTheme();
  const on = v !== 'off';
  return (
    <Text>
      <Text color={on ? t.green : t.faint}>{on ? '◉' : '○'}</Text>
      <Text color={on ? t.fg : t.dim}> {v}</Text>
    </Text>
  );
}

export function Settings({
  themeIx,
  onTheme,
  onBack,
}: {
  themeIx: number;
  onTheme: (i: number) => void;
  onBack: () => void;
}) {
  const t = useTheme();
  const { columns, rows } = useTermSize();
  const [tab, setTab] = useState<Tab>('appearance');
  const [row, setRow] = useState(themeIx);
  const [modelIx, setModelIx] = useState(0);

  const rowsMax =
    tab === 'appearance' ? themes.length : tab === 'model' ? MODELS.length : tab === 'behavior' ? BEHAVIOR.length : KEYS.length;

  useInput((ch, key) => {
    if (key.escape || ch === 'q') return onBack();
    if (key.leftArrow || (key.shift && key.tab))
      return setTab((v) => TABS[(TABS.indexOf(v) + TABS.length - 1) % TABS.length]!);
    if (key.rightArrow || key.tab)
      return setTab((v) => TABS[(TABS.indexOf(v) + 1) % TABS.length]!);
    if (key.upArrow || ch === 'k') return setRow((r) => Math.max(0, r - 1));
    if (key.downArrow || ch === 'j') return setRow((r) => Math.min(rowsMax - 1, r + 1));
    if (key.return) {
      if (tab === 'appearance') onTheme(row);
      if (tab === 'model') setModelIx(row);
    }
  });

  const w = Math.min(columns - 4, 78);

  return (
    <Box width={columns} height={rows} flexDirection="column" alignItems="center">
      <Box marginTop={1} width={w} flexDirection="column">
        <Box justifyContent="space-between">
          <Text color={t.bright} bold>
            ⚙ settings
          </Text>
          <Text color={t.faint}>changes apply live · nothing persists (mock)</Text>
        </Box>

        {/* tabs */}
        <Box marginTop={1} columnGap={1}>
          {TABS.map((tb) => (
            <Text key={tb}>
              {tb === tab ? (
                <Text backgroundColor={t.selBg} color={t.accent} bold>
                  {' '}{tb}{' '}
                </Text>
              ) : (
                <Text color={t.dim}> {tb} </Text>
              )}
            </Text>
          ))}
        </Box>
        <Rule width={w} />

        <Box marginTop={1} flexDirection="column">
          {tab === 'appearance' &&
            themes.map((th, i) => (
              <Box key={th.id} flexDirection="column" marginBottom={0}>
                <Box>
                  <Text color={i === row ? t.accent : t.faint}>{i === row ? '▌ ' : '  '}</Text>
                  <Box width={16}>
                    <Text color={i === row ? t.bright : t.fg} bold={i === row}>
                      {th.name}
                    </Text>
                  </Box>
                  {/* live swatch strip */}
                  <Text>
                    <Text color={th.accent}>████</Text>
                    <Text color={th.fg}>██</Text>
                    <Text color={th.dim}>██</Text>
                    <Text color={th.green}>█</Text>
                    <Text color={th.red}>█</Text>
                    <Text color={th.yellow}>█</Text>
                    <Text color={th.cyan}>█</Text>
                  </Text>
                  {i === themeIx && <Text color={t.green}>  ✓ active</Text>}
                </Box>
              </Box>
            ))}

          {tab === 'model' &&
            MODELS.map((m, i) => (
              <Box key={m.id}>
                <Text color={i === row ? t.accent : t.faint}>{i === row ? '▌ ' : '  '}</Text>
                <Box width={22}>
                  <Text color={i === row ? t.bright : t.fg} bold={i === modelIx}>
                    {m.id}
                  </Text>
                </Box>
                <Text color={t.dim}>{m.desc}</Text>
                {i === modelIx && <Text color={t.green}>  ✓</Text>}
                {m.badge && <Text color={t.yellow}>  {m.badge}</Text>}
              </Box>
            ))}

          {tab === 'behavior' &&
            BEHAVIOR.map((b, i) => (
              <Box key={b.k}>
                <Text color={i === row ? t.accent : t.faint}>{i === row ? '▌ ' : '  '}</Text>
                <Box width={24}>
                  <Text color={i === row ? t.bright : t.fg}>{b.k}</Text>
                </Box>
                <Box width={10}>
                  <Toggle v={b.v} />
                </Box>
                <Text color={t.faint}>{b.desc}</Text>
              </Box>
            ))}

          {tab === 'keys' && (
            <Box flexDirection="column">
              {KEYS.map(([k, d], i) => (
                <Box key={k}>
                  <Text color={i === row ? t.accent : t.faint}>{i === row ? '▌ ' : '  '}</Text>
                  <Box width={14}>
                    <Text color={t.accent}>{k}</Text>
                  </Box>
                  <Text color={t.dim}>{d}</Text>
                </Box>
              ))}
              <Box marginTop={1}>
                <Text color={t.faint}>rebinding lives in ~/.alcor/keys.json (mock)</Text>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box flexGrow={1} />
      <Box width={columns - 2} justifyContent="space-between" paddingX={1}>
        <Hint
          pairs={[
            ['←→', 'tab'],
            ['↑↓', 'row'],
            ['enter', 'apply'],
            ['esc', 'back'],
          ]}
        />
        <Text color={t.faint}>ALCOR α</Text>
      </Box>
    </Box>
  );
}
