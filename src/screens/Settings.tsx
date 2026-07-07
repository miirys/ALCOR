import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Hint, Rule, CornerTag, useTheme } from '../ui.tsx';
import { useTermSize } from '../hooks.ts';
import { themes } from '../theme.ts';
import { models as MODELS, mcpServers, skills, stats } from '../mock/data.ts';

const TABS = ['Appearance', 'Model', 'Behavior', 'Stats', 'MCP & Skills', 'Keys'] as const;
type Tab = (typeof TABS)[number];

const BEHAVIOR = [
  { k: 'Auto-approve edits', v: 'on', desc: 'Build mode applies file edits without asking' },
  { k: 'Verify after change', v: 'on', desc: 'Run the project verify loop after edits' },
  { k: 'Turn timer', v: 'on', desc: 'Print "Turn completed in …" after each turn' },
  { k: 'Context warnings', v: '80%', desc: 'Warn when context passes the threshold' },
  { k: 'Mouse support', v: 'on', desc: 'Click to fold traces, scroll the transcript' },
  { k: 'Telemetry', v: 'off', desc: 'Nothing leaves this machine' },
];

const KEYS = [
  ['Shift+Tab', 'Cycle mode'],
  ['Ctrl+B', 'Sidebar'],
  ['Ctrl+D', 'Diff review'],
  ['Ctrl+O', 'Fold / unfold'],
  ['Ctrl+L', 'Clear transcript'],
  ['?', 'Shortcut overlay'],
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

/** Horizontal bar built from block glyphs. */
function Bar({ value, width, color }: { value: number; width: number; color: string }) {
  const t = useTheme();
  const filled = Math.round(value * width);
  return (
    <Text>
      <Text color={color}>{'▇'.repeat(filled)}</Text>
      <Text color={t.faint}>{'▁'.repeat(Math.max(0, width - filled))}</Text>
    </Text>
  );
}

const SPARK = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];

function StatsTab() {
  const t = useTheme();
  return (
    <Box flexDirection="column" rowGap={1}>
      {/* totals */}
      <Box columnGap={3}>
        {(
          [
            ['Sessions', String(stats.totals.sessions)],
            ['Turns', String(stats.totals.turns)],
            ['Tokens', stats.totals.tokens],
            ['Est. cost', stats.totals.cost],
          ] as const
        ).map(([k, v]) => (
          <Box key={k} flexDirection="column">
            <Text color={t.faint}>{k}</Text>
            <Text color={t.bright} bold>
              {v}
            </Text>
          </Box>
        ))}
      </Box>

      {/* model usage */}
      <Box flexDirection="column">
        <Text color={t.dim}>Model usage · Last 30 days</Text>
        {stats.modelUsage.map((m) => (
          <Box key={m.id}>
            <Box width={22}>
              <Text color={t.fg}>{m.id}</Text>
            </Box>
            <Bar value={m.share} width={24} color={t.accent} />
            <Text color={t.dim}>
              {'  '}
              {Math.round(m.share * 100)}%
            </Text>
            <Text color={t.faint}> · {m.tokens}</Text>
          </Box>
        ))}
      </Box>

      {/* daily sparkline */}
      <Box flexDirection="column">
        <Text color={t.dim}>Tokens per day · Last 14 days</Text>
        <Box>
          <Text color={t.accent}>
            {stats.daily.map((v) => SPARK[Math.min(7, Math.round(v * 7))]).join(' ')}
          </Text>
          <Text color={t.faint}>{'  '}Peak {stats.dailyPeak}</Text>
        </Box>
      </Box>

      {/* tool invocations */}
      <Box flexDirection="column">
        <Text color={t.dim}>Tool invocations</Text>
        {stats.tools.map((tool) => {
          const max = stats.tools[0]!.count;
          return (
            <Box key={tool.name}>
              <Box width={10}>
                <Text color={t.fg}>{tool.name}</Text>
              </Box>
              <Bar value={tool.count / max} width={20} color={t.accentDim} />
              <Text color={t.dim}>
                {'  '}
                {tool.count}
              </Text>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

function McpSkillsTab({ row }: { row: number }) {
  const t = useTheme();
  return (
    <Box flexDirection="column" rowGap={1}>
      <Box flexDirection="column">
        <Text color={t.dim}>MCP servers · /mcp shows this in-chat</Text>
        {mcpServers.map((s, i) => (
          <Box key={s.name}>
            <Text color={i === row ? t.accent : t.faint}>{i === row ? '▌ ' : '  '}</Text>
            {s.state === 'ok' ? (
              <Text color={t.green}>● </Text>
            ) : (
              <Text color={t.red}>○ </Text>
            )}
            <Box width={13}>
              <Text color={t.fg}>{s.name}</Text>
            </Box>
            <Box width={7}>
              <Text color={t.dim}>{s.lat}</Text>
            </Box>
            <Text color={t.faint}>
              {s.state === 'ok' ? `${s.tools} tools · Healthy` : 'Unreachable · Retrying in 30s'}
            </Text>
          </Box>
        ))}
      </Box>

      <Box flexDirection="column">
        <Text color={t.dim}>Agent Skills · Enter toggles (mock)</Text>
        {skills.map((s, i) => {
          const ri = i + mcpServers.length;
          const stateColor =
            s.state === 'active' ? t.green : s.state === 'idle' ? t.yellow : t.faint;
          return (
            <Box key={s.name}>
              <Text color={ri === row ? t.accent : t.faint}>{ri === row ? '▌ ' : '  '}</Text>
              <Text color={stateColor}>{s.state === 'active' ? '◉ ' : '○ '}</Text>
              <Box width={18}>
                <Text color={t.fg}>{s.name}</Text>
              </Box>
              <Box width={10}>
                <Text color={stateColor}>{s.state[0]!.toUpperCase() + s.state.slice(1)}</Text>
              </Box>
              <Text color={t.faint}>{s.desc}</Text>
            </Box>
          );
        })}
      </Box>
    </Box>
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
  const [tab, setTab] = useState<Tab>('Appearance');
  const [row, setRow] = useState(themeIx);
  const [modelIx, setModelIx] = useState(0);

  const rowsMax =
    tab === 'Appearance'
      ? themes.length
      : tab === 'Model'
        ? MODELS.length
        : tab === 'Behavior'
          ? BEHAVIOR.length
          : tab === 'MCP & Skills'
            ? mcpServers.length + skills.length
            : tab === 'Keys'
              ? KEYS.length
              : 1;

  useInput((ch, key) => {
    if (key.escape || ch === 'q') return onBack();
    if (key.leftArrow || (key.shift && key.tab)) {
      setRow(0);
      return setTab((v) => TABS[(TABS.indexOf(v) + TABS.length - 1) % TABS.length]!);
    }
    if (key.rightArrow || key.tab) {
      setRow(0);
      return setTab((v) => TABS[(TABS.indexOf(v) + 1) % TABS.length]!);
    }
    if (key.upArrow || ch === 'k') return setRow((r) => Math.max(0, r - 1));
    if (key.downArrow || ch === 'j') return setRow((r) => Math.min(rowsMax - 1, r + 1));
    if (key.return) {
      if (tab === 'Appearance') onTheme(row);
      if (tab === 'Model') setModelIx(row);
    }
  });

  const w = Math.min(columns - 4, 82);

  return (
    <Box width={columns} height={rows} flexDirection="column" alignItems="center">
      <Box marginTop={1} width={w} flexDirection="column">
        <Box justifyContent="space-between">
          <Text color={t.bright} bold>
            ◈ Settings
          </Text>
          <Text color={t.faint}>Changes apply live · Nothing persists (mock)</Text>
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
          {tab === 'Appearance' && (
            <Box flexDirection="column">
              <Box marginBottom={1}>
                <Text color={t.faint}>
                  The default is monochrome — color is reserved for diffs, state, and markers.
                </Text>
              </Box>
              {themes.map((th, i) => (
                <Box key={th.id}>
                  <Text color={i === row ? t.accent : t.faint}>{i === row ? '▌ ' : '  '}</Text>
                  <Box width={16}>
                    <Text color={i === row ? t.bright : t.fg} bold={i === row}>
                      {th.name}
                    </Text>
                  </Box>
                  <Text>
                    <Text color={th.accent}>████</Text>
                    <Text color={th.fg}>██</Text>
                    <Text color={th.dim}>██</Text>
                    <Text color={th.green}>█</Text>
                    <Text color={th.red}>█</Text>
                    <Text color={th.yellow}>█</Text>
                    <Text color={th.cyan}>█</Text>
                  </Text>
                  {i === themeIx && <Text color={t.green}>  ✓ Active</Text>}
                </Box>
              ))}
            </Box>
          )}

          {tab === 'Model' &&
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

          {tab === 'Behavior' &&
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

          {tab === 'Stats' && <StatsTab />}

          {tab === 'MCP & Skills' && <McpSkillsTab row={row} />}

          {tab === 'Keys' && (
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
                <Text color={t.faint}>Rebinding lives in ~/.alcor/keys.json (mock)</Text>
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Box flexGrow={1} />
      <Box width={columns - 2} justifyContent="space-between" paddingX={1}>
        <Hint
          pairs={[
            ['←→', 'Tab'],
            ['↑↓', 'Row'],
            ['Enter', 'Apply'],
            ['Esc', 'Back'],
          ]}
        />
        <CornerTag />
      </Box>
    </Box>
  );
}
