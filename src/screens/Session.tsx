import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { StarMark, ContextMeter, Hint, Spinner, useTheme } from '../ui.tsx';
import { EventView, DiffStat } from '../chat.tsx';
import { useTermSize, useFrame } from '../hooks.ts';
import {
  Event,
  ToolEvent,
  PermEvent,
  SessionMeta,
  demoTurn,
  ScriptStep,
  fileDiffs,
  planMarkdown,
  shortcuts,
  slashCommands,
  models,
  efforts,
} from '../mock/data.ts';
import { themes } from '../theme.ts';

type Mode = 'normal' | 'plan' | 'auto';
const MODES: Mode[] = ['normal', 'plan', 'auto'];

const MODE_STYLE: Record<Mode, { label: string; icon: string }> = {
  normal: { label: 'NORMAL', icon: '⏵' },
  plan: { label: 'PLAN', icon: '▤' },
  auto: { label: 'AUTO', icon: '⏩' },
};

// ── sidebar ──────────────────────────────────────────────────────────────

function Sidebar({ height, tokens }: { height: number; tokens: number }) {
  const t = useTheme();
  const totalAdd = fileDiffs.reduce((a, d) => a + d.add, 0);
  const totalDel = fileDiffs.reduce((a, d) => a + d.del, 0);
  const dirs = new Map<string, typeof fileDiffs>();
  for (const d of fileDiffs) {
    const dir = d.path.split('/').slice(0, -1).join('/');
    dirs.set(dir, [...(dirs.get(dir) ?? []), d]);
  }
  return (
    <Box
      flexDirection="column"
      width={34}
      height={height}
      borderStyle="round"
      borderColor={t.border}
      paddingX={1}
      overflow="hidden"
    >
      <Box justifyContent="space-between">
        <Text color={t.bright} bold>
          Changes
        </Text>
        <DiffStat add={totalAdd} del={totalDel} />
      </Box>
      <Text color={t.faint}>{'─'.repeat(30)}</Text>
      {[...dirs.entries()].map(([dir, files]) => (
        <Box key={dir} flexDirection="column">
          <Text color={t.dim}>▾ {dir}/</Text>
          {files.map((f) => {
            const name = f.path.split('/').pop()!;
            const sc =
              f.status === 'A' ? t.green : f.status === 'D' ? t.red : t.yellow;
            return (
              <Box key={f.path} marginLeft={2} justifyContent="space-between">
                <Text>
                  <Text color={sc}>{f.status}</Text>
                  <Text color={t.fg}> {name.length > 20 ? name.slice(0, 19) + '…' : name}</Text>
                </Text>
                <DiffStat add={f.add} del={f.del} />
              </Box>
            );
          })}
        </Box>
      ))}
      <Box marginTop={1}>
        <Text color={t.faint}>{'─'.repeat(30)}</Text>
      </Box>
      <Text color={t.bright} bold>
        Agents
      </Text>
      <Box>
        <Spinner kind="pulse" color={t.magenta} />
        <Text color={t.magenta}> verify-tests</Text>
        <Text color={t.faint}> · Nested</Text>
      </Box>
      <Box>
        <Text color={t.faint}>○ reviewer</Text>
        <Text color={t.faint}> · Idle</Text>
      </Box>
      <Box flexGrow={1} />
      <Text color={t.faint}>Session tokens · {(tokens / 1000).toFixed(1)}k</Text>
      <Text color={t.faint}>Ctrl+D · Review diffs</Text>
    </Box>
  );
}

// ── command palette ──────────────────────────────────────────────────────

function Palette({ query, index }: { query: string; index: number }) {
  const t = useTheme();
  const items = slashCommands.filter((c) => c.cmd.startsWith(query));
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={t.accentDim}
      paddingX={1}
      width={64}
    >
      <Box justifyContent="space-between">
        <Text color={t.dim}>Commands</Text>
        <Text color={t.faint}>↑↓ Choose · Enter Run · Esc Close</Text>
      </Box>
      {items.slice(0, 8).map((c, i) => (
        <Box key={c.cmd} justifyContent="space-between">
          <Text>
            <Text color={i === index ? t.accent : t.faint}>
              {i === index ? '▌ ' : '  '}
            </Text>
            <Text color={i === index ? t.bright : t.fg} bold={i === index}>
              {c.cmd.padEnd(10)}
            </Text>
            <Text color={t.dim}> {c.desc}</Text>
          </Text>
          <Text color={t.faint}>{c.ctx}</Text>
        </Box>
      ))}
      {items.length === 0 && <Text color={t.faint}>  No matching command</Text>}
    </Box>
  );
}

// ── overlays ─────────────────────────────────────────────────────────────

function PlanOverlay({ width }: { width: number }) {
  const t = useTheme();
  const w = Math.min(width - 8, 72);
  return (
    <Box flexDirection="column" borderStyle="double" borderColor={t.accent} paddingX={2} paddingY={1} width={w}>
      <Box justifyContent="space-between">
        <Text color={t.accent} bold>
          ▤ PLAN · Awaiting review
        </Text>
        <Text color={t.faint}>plan.md</Text>
      </Box>
      <Text> </Text>
      {planMarkdown.map((l, i) => {
        if (l.startsWith('## '))
          return (
            <Text key={i} color={t.bright} bold>
              {l.slice(3)}
            </Text>
          );
        if (l.startsWith('_'))
          return (
            <Text key={i} color={t.faint} italic>
              {l.replaceAll('_', '')}
            </Text>
          );
        const bold = l.match(/\*\*(.+?)\*\*/);
        if (bold)
          return (
            <Text key={i} color={t.fg}>
              {l.split('**')[0]}
              <Text color={t.accent} bold>
                {bold[1]}
              </Text>
              {l.split('**')[2]}
            </Text>
          );
        return (
          <Text key={i} color={t.dim}>
            {l || ' '}
          </Text>
        );
      })}
      <Text> </Text>
      <Box justifyContent="center" columnGap={3}>
        <Text>
          <Text color={t.green} bold>
            [a]
          </Text>
          <Text color={t.fg}> Approve</Text>
        </Text>
        <Text>
          <Text color={t.yellow} bold>
            [c]
          </Text>
          <Text color={t.fg}> Comment</Text>
        </Text>
        <Text>
          <Text color={t.red} bold>
            [q]
          </Text>
          <Text color={t.fg}> Quit — keep the plan in scrollback</Text>
        </Text>
      </Box>
    </Box>
  );
}

function ShortcutsOverlay() {
  const t = useTheme();
  const mid = Math.ceil(shortcuts.length / 2);
  const cols = [shortcuts.slice(0, mid), shortcuts.slice(mid)];
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={t.borderActive} paddingX={2} paddingY={1}>
      <Text color={t.bright} bold>
        Keyboard — {shortcuts.length} of 50+ shortcuts
      </Text>
      <Text> </Text>
      <Box columnGap={4}>
        {cols.map((col, ci) => (
          <Box key={ci} flexDirection="column">
            {col.map(([k, d]) => (
              <Box key={k}>
                <Box width={13}>
                  <Text color={t.accent}>{k}</Text>
                </Box>
                <Text color={t.dim}>{d}</Text>
              </Box>
            ))}
          </Box>
        ))}
      </Box>
      <Text> </Text>
      <Text color={t.faint}>Esc closes</Text>
    </Box>
  );
}

/** /model — in-chat picker with reasoning-effort segmented control. */
function ModelOverlay({
  row,
  effortIx,
  currentIx,
}: {
  row: number;
  effortIx: number;
  currentIx: number;
}) {
  const t = useTheme();
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={t.accent} paddingX={2} paddingY={1} width={66}>
      <Box justifyContent="space-between">
        <Text color={t.accent} bold>
          ⇄ Model
        </Text>
        <Text color={t.faint}>↑↓ Model · ←→ Effort · Enter Apply · Esc</Text>
      </Box>
      <Text> </Text>
      {models.map((m, i) => (
        <Box key={m.id}>
          <Text color={i === row ? t.accent : t.faint}>{i === row ? '▌ ' : '  '}</Text>
          <Box width={22}>
            <Text color={i === row ? t.bright : t.fg} bold={i === currentIx}>
              {m.id}
            </Text>
          </Box>
          <Text color={t.dim}>{m.desc}</Text>
          {i === currentIx && <Text color={t.green}> ✓</Text>}
          {m.badge && <Text color={t.yellow}> {m.badge}</Text>}
        </Box>
      ))}
      <Text> </Text>
      <Box>
        <Text color={t.dim}>Reasoning effort  </Text>
        {efforts.map((e, i) => (
          <Text key={e}>
            {i === effortIx ? (
              <Text backgroundColor={t.selBg} color={t.accent} bold>
                {' '}{e}{' '}
              </Text>
            ) : (
              <Text color={t.faint}> {e} </Text>
            )}
          </Text>
        ))}
      </Box>
    </Box>
  );
}

/** /theme — in-chat picker with live swatches; applies instantly on move. */
function ThemeOverlay({ row }: { row: number }) {
  const t = useTheme();
  return (
    <Box flexDirection="column" borderStyle="round" borderColor={t.accent} paddingX={2} paddingY={1} width={56}>
      <Box justifyContent="space-between">
        <Text color={t.accent} bold>
          ◩ Theme
        </Text>
        <Text color={t.faint}>↑↓ Preview live · Enter Keep · Esc</Text>
      </Box>
      <Text> </Text>
      {themes.map((th, i) => (
        <Box key={th.id}>
          <Text color={i === row ? t.accent : t.faint}>{i === row ? '▌ ' : '  '}</Text>
          <Box width={14}>
            <Text color={i === row ? t.bright : t.fg}>{th.name}</Text>
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
        </Box>
      ))}
    </Box>
  );
}

// ── input bar ────────────────────────────────────────────────────────────

function InputBar({
  value,
  mode,
  busy,
  width,
  model,
}: {
  value: string;
  mode: Mode;
  busy: boolean;
  width: number;
  model: string;
}) {
  const t = useTheme();
  const frame = useFrame(2);
  const cursor = frame % 2 === 0 ? '▋' : ' ';
  const m = MODE_STYLE[mode];
  const modeColor = mode === 'plan' ? t.yellow : mode === 'auto' ? t.green : t.accent;
  return (
    <Box flexDirection="column" width={width}>
      <Box
        borderStyle="round"
        borderColor={busy ? t.border : modeColor === t.accent ? t.borderActive : modeColor}
        paddingX={1}
        width={width}
      >
        <Text color={busy ? t.faint : t.accent}>❯ </Text>
        {value ? (
          <Text color={t.bright}>
            {value}
            <Text color={t.accent}>{cursor}</Text>
          </Text>
        ) : (
          <Text color={t.faint}>
            {busy ? 'Agent is working — Esc interrupts' : 'Ask ALCOR anything… ( / for commands )'}
            {!busy && <Text color={t.accent}> {cursor}</Text>}
          </Text>
        )}
      </Box>
      <Box justifyContent="space-between" paddingX={1}>
        <Text>
          <Text color={modeColor} bold>
            {m.icon} {m.label}
          </Text>
          <Text color={t.faint}>  Shift+Tab Mode · ? Shortcuts · Ctrl+B Sidebar</Text>
        </Text>
        <Text>
          <Text color={t.dim}>{model}</Text>
          <Text color={t.faint}> · </Text>
          <Text color={t.accentDim}>ALCOR α</Text>
        </Text>
      </Box>
    </Box>
  );
}

// ── main session screen ──────────────────────────────────────────────────

type Overlay = 'none' | 'plan' | 'keys' | 'model' | 'theme';

export function Session({
  meta,
  onBack,
  onSettings,
  onDiff,
  themeIx,
  onSetTheme,
}: {
  meta: SessionMeta | null;
  onBack: () => void;
  onSettings: () => void;
  onDiff: () => void;
  themeIx: number;
  onSetTheme: (i: number) => void;
}) {
  const t = useTheme();
  const { columns, rows } = useTermSize();
  const [events, setEvents] = useState<Event[]>(
    meta
      ? [
          {
            type: 'notice',
            id: 'resume',
            text: `Resumed "${meta.title}" · ${meta.turns} turns restored`,
          },
        ]
      : [],
  );
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<Mode>('normal');
  const [busy, setBusy] = useState(false);
  const [sidebar, setSidebar] = useState(true);
  const [expanded, setExpanded] = useState(false);
  const [overlay, setOverlay] = useState<Overlay>('none');
  const [scroll, setScroll] = useState(0);
  const [paletteIx, setPaletteIx] = useState(0);
  const [tokens, setTokens] = useState(meta?.tokens ?? 18_400);
  const [modelIx, setModelIx] = useState(0);
  const [modelRow, setModelRow] = useState(0);
  const [effortIx, setEffortIx] = useState(1);
  const [themeRow, setThemeRow] = useState(themeIx);
  const [alwaysAllow, setAlwaysAllow] = useState(false);
  const ctxMax = meta?.ctxMax ?? 256_000;

  const timers = useRef<NodeJS.Timeout[]>([]);
  const queue = useRef<ScriptStep[]>([]);
  const qi = useRef(0);
  const pendingPerm = useRef<string | null>(null);
  const modeRef = useRef(mode);
  modeRef.current = mode;
  const alwaysRef = useRef(alwaysAllow);
  alwaysRef.current = alwaysAllow;

  useEffect(() => () => timers.current.forEach(clearTimeout), []);

  const showPalette = input.startsWith('/') && overlay === 'none';
  const paletteItems = slashCommands.filter((c) => c.cmd.startsWith(input));

  const notice = useCallback((text: string) => {
    setEvents((p) => [...p, { type: 'notice', id: `n${Date.now()}${p.length}`, text }]);
  }, []);

  const pushTool = useCallback((ev: ToolEvent) => {
    setEvents((p) => [...p, ev]);
    setTokens((v) => Math.min(256_000, v + 1200));
    timers.current.push(
      setTimeout(() => {
        setEvents((prev) =>
          prev.map((e) =>
            e.type === 'tool' && e.id === ev.id && e.state === 'running'
              ? ({ ...e, state: 'done' } as ToolEvent)
              : e,
          ),
        );
      }, ev.durationMs),
    );
  }, []);

  /** Sequential turn engine — pauses on permission cards. */
  const advance = useCallback(() => {
    const steps = queue.current;
    const i = qi.current;
    if (i >= steps.length) {
      setBusy(false);
      return;
    }
    const step = steps[i]!;
    qi.current = i + 1;
    let ev = step.event;

    // permission gate: AUTO mode or "always" auto-resolves
    if (ev.type === 'perm') {
      if (modeRef.current === 'auto' || alwaysRef.current) {
        ev = { ...ev, state: 'auto' } as PermEvent;
        setEvents((p) => [...p, ev]);
      } else {
        setEvents((p) => [...p, ev]);
        pendingPerm.current = ev.id;
        return; // engine paused until keypress
      }
    } else {
      setEvents((prev) => {
        const next = [...prev];
        if (ev.type !== 'tool') {
          for (let k = 0; k < next.length; k++) {
            const e = next[k]!;
            if (e.type === 'tool' && e.state === 'running')
              next[k] = { ...e, state: 'done' } as ToolEvent;
          }
        }
        return [...next, ev];
      });
      setTokens((v) => Math.min(256_000, v + 2400 + Math.round(Math.random() * 3000)));
      if (ev.type === 'tool') {
        const toolId = ev.id;
        const dur = ev.durationMs;
        timers.current.push(
          setTimeout(() => {
            setEvents((prev) =>
              prev.map((e) =>
                e.type === 'tool' && e.id === toolId && e.state === 'running'
                  ? ({ ...e, state: 'done' } as ToolEvent)
                  : e,
              ),
            );
          }, dur),
        );
      }
      if (ev.type === 'turn-end') {
        setBusy(false);
      }
    }

    const next = steps[qi.current];
    if (next) {
      timers.current.push(setTimeout(advance, next.after - step.after));
    } else {
      setBusy(false);
    }
  }, []);

  const runTurn = useCallback(
    (text: string) => {
      setBusy(true);
      setScroll(0);
      queue.current = demoTurn(text);
      qi.current = 0;
      timers.current.push(setTimeout(advance, queue.current[0]!.after));
    },
    [advance],
  );

  const resolvePerm = useCallback(
    (verdict: 'allowed' | 'always' | 'rejected') => {
      const id = pendingPerm.current;
      if (!id) return;
      pendingPerm.current = null;
      setEvents((p) =>
        p.map((e) => (e.type === 'perm' && e.id === id ? { ...e, state: verdict } : e)),
      );
      if (verdict === 'always') setAlwaysAllow(true);
      if (verdict === 'rejected') {
        queue.current = [];
        setBusy(false);
        notice('Edit rejected — the agent noted the objection and stopped');
        return;
      }
      timers.current.push(setTimeout(advance, 300));
    },
    [advance, notice],
  );

  const runCommand = useCallback(
    (cmd: string) => {
      switch (cmd) {
        case '/plan':
          setOverlay('plan');
          break;
        case '/diff':
          onDiff();
          break;
        case '/settings':
          onSettings();
          break;
        case '/sessions':
          onBack();
          break;
        case '/theme':
          setThemeRow(themeIx);
          setOverlay('theme');
          break;
        case '/help':
          setOverlay('keys');
          break;
        case '/compact':
          pushTool({
            type: 'tool',
            id: `c${Date.now()}`,
            tool: 'compact',
            title: 'context',
            durationMs: 2200,
            state: 'running',
            meta: '−62%',
          });
          timers.current.push(
            setTimeout(() => setTokens((v) => Math.round(v * 0.38)), 2200),
          );
          break;
        case '/model':
          setModelRow(modelIx);
          setOverlay('model');
          break;
        case '/imagine':
          pushTool({
            type: 'tool',
            id: `i${Date.now()}`,
            tool: 'imagine',
            title: '"star chart of Ursa Major, isometric"',
            durationMs: 2600,
            state: 'running',
          });
          break;
        case '/mcp':
          pushTool({
            type: 'tool',
            id: `m${Date.now()}`,
            tool: 'mcp',
            title: '4 servers · 3 healthy',
            durationMs: 700,
            state: 'running',
            meta: '22 tools',
          });
          break;
        case '/quit':
          onBack();
          break;
        default:
          notice(`Unknown command ${cmd}`);
      }
    },
    [onBack, onDiff, onSettings, themeIx, modelIx, pushTool, notice],
  );

  useInput((ch, key) => {
    // permission card owns input while asking
    if (pendingPerm.current) {
      if (ch === 'y') return resolvePerm('allowed');
      if (ch === 'a') return resolvePerm('always');
      if (ch === 'n' || key.escape) return resolvePerm('rejected');
      return;
    }

    if (overlay === 'plan') {
      if (ch === 'a') {
        setOverlay('none');
        notice('Plan approved — executing');
        setMode('normal');
        runTurn('(Execute the approved plan)');
      } else if (ch === 'c') {
        setOverlay('none');
        setInput('Comment: ');
      } else if (ch === 'q' || key.escape) {
        setOverlay('none');
        notice('Plan kept in scrollback (plan.md)');
      }
      return;
    }
    if (overlay === 'keys') {
      if (key.escape || ch === '?') setOverlay('none');
      return;
    }
    if (overlay === 'model') {
      if (key.escape) return setOverlay('none');
      if (key.upArrow) return setModelRow((r) => Math.max(0, r - 1));
      if (key.downArrow) return setModelRow((r) => Math.min(models.length - 1, r + 1));
      if (key.leftArrow) return setEffortIx((e) => Math.max(0, e - 1));
      if (key.rightArrow) return setEffortIx((e) => Math.min(efforts.length - 1, e + 1));
      if (key.return) {
        setModelIx(modelRow);
        setOverlay('none');
        notice(`Model → ${models[modelRow]!.id} · Effort ${efforts[effortIx]}`);
      }
      return;
    }
    if (overlay === 'theme') {
      if (key.escape || key.return) return setOverlay('none');
      if (key.upArrow) {
        const r = Math.max(0, themeRow - 1);
        setThemeRow(r);
        onSetTheme(r); // live preview
      }
      if (key.downArrow) {
        const r = Math.min(themes.length - 1, themeRow + 1);
        setThemeRow(r);
        onSetTheme(r);
      }
      return;
    }

    if (key.escape) {
      if (showPalette) return setInput('');
      if (busy) {
        timers.current.forEach(clearTimeout);
        timers.current = [];
        queue.current = [];
        setBusy(false);
        setEvents((p) => {
          const next = p.map((e) =>
            e.type === 'tool' && e.state === 'running'
              ? ({ ...e, state: 'error', meta: 'interrupted' } as ToolEvent)
              : e,
          );
          return [
            ...next,
            { type: 'notice', id: `n${Date.now()}`, text: 'Interrupted by user' },
          ];
        });
        return;
      }
      return onBack();
    }

    if (key.shift && key.tab) {
      setMode((m) => MODES[(MODES.indexOf(m) + 1) % MODES.length]!);
      return;
    }
    if (key.ctrl && ch === 'b') return setSidebar((v) => !v);
    if (key.ctrl && ch === 'd') return onDiff();
    if (key.ctrl && ch === 'o') return setExpanded((v) => !v);
    if (key.ctrl && ch === 's') return onSettings();
    if (key.ctrl && ch === 'l') return setEvents([]);
    if (key.pageUp) return setScroll((s) => s + 4);
    if (key.pageDown) return setScroll((s) => Math.max(0, s - 4));

    if (showPalette) {
      if (key.upArrow) return setPaletteIx((i) => Math.max(0, i - 1));
      if (key.downArrow)
        return setPaletteIx((i) => Math.min(paletteItems.length - 1, i + 1));
      if (key.return) {
        const chosen = paletteItems[paletteIx]?.cmd ?? input;
        setInput('');
        setPaletteIx(0);
        runCommand(chosen);
        return;
      }
    } else if (key.return) {
      const text = input.trim();
      if (!text) return;
      setInput('');
      if (text.startsWith('/')) return runCommand(text);
      if (busy) return;
      if (mode === 'plan') {
        setEvents((p) => [
          ...p,
          { type: 'user', id: `u${Date.now()}`, text },
          {
            type: 'thinking',
            id: `th${Date.now()}`,
            text: 'Drafting plan — read-only exploration…',
          },
        ]);
        timers.current.push(setTimeout(() => setOverlay('plan'), 1600));
        return;
      }
      runTurn(text);
      return;
    }

    if (ch === '?' && input === '') return setOverlay('keys');
    if (key.backspace || key.delete) {
      setInput((v) => v.slice(0, -1));
      setPaletteIx(0);
      return;
    }
    if (ch && !key.ctrl && !key.meta) {
      setInput((v) => v + ch);
      setPaletteIx(0);
    }
  });

  // transcript viewport: newest at bottom, manual scroll offset in items.
  // overlays and the palette take rows away from the transcript so the
  // full frame never exceeds the terminal height (Ink would interleave).
  const overlayH =
    overlay === 'plan'
      ? planMarkdown.length + 9
      : overlay === 'keys'
        ? Math.ceil(shortcuts.length / 2) + 8
        : overlay === 'model'
          ? models.length + 8
          : overlay === 'theme'
            ? themes.length + 6
            : 0;
  const paletteH = showPalette ? Math.min(paletteItems.length, 8) + 3 : 0;
  const headerH = 1;
  const inputH = 4;
  const bodyH = Math.max(4, rows - headerH - inputH - overlayH - paletteH);
  const showSidebar = sidebar && columns >= 100;
  const mainW = showSidebar ? columns - 36 : columns - 2;

  const estimate = (e: Event): number => {
    if (e.type === 'tool') {
      let h = 1;
      if (e.state !== 'running' && e.detail)
        h +=
          Math.min(expanded ? e.detail.length : 2, e.detail.length) +
          (!expanded && e.detail.length > 2 ? 1 : 0);
      if (e.state !== 'running' && e.diff)
        h += Math.min(expanded ? e.diff.lines.length : 6, e.diff.lines.length) + 1;
      if (e.todos) h += e.todos.length;
      if (e.sub) h += e.state === 'running' ? 2 : e.sub.lines.length + 2;
      if (e.tool === 'imagine') h += 12;
      if (e.tool === 'compact') h += 2;
      if (e.tool === 'mcp') h += 4;
      return h;
    }
    if (e.type === 'perm') return e.state === 'ask' ? 11 : 4;
    if (e.type === 'assistant') return Math.ceil(e.text.length / 76) + 2;
    return 2;
  };
  const visible: Event[] = [];
  {
    let used = 0;
    let skip = scroll;
    for (let i = events.length - 1; i >= 0; i--) {
      const h = estimate(events[i]!);
      if (skip > 0) {
        skip -= 1;
        continue;
      }
      if (used + h > bodyH - 1) break;
      visible.unshift(events[i]!);
      used += h;
    }
  }

  const lastId = events[events.length - 1]?.id;

  return (
    <Box width={columns} height={rows} flexDirection="column">
      {/* header */}
      <Box paddingX={1} justifyContent="space-between" width={columns}>
        <Text>
          <StarMark />
          <Text color={t.faint}> · </Text>
          <Text color={t.dim}>{meta?.cwd ?? '~/dev/nebula-api'}</Text>
          <Text color={t.faint}> · </Text>
          <Text color={t.accentDim}>⎇ {meta?.branch ?? 'main'}</Text>
        </Text>
        <ContextMeter used={tokens} max={ctxMax} />
      </Box>

      {/* body */}
      <Box flexGrow={1} width={columns} paddingX={1}>
        <Box flexDirection="column" width={mainW} height={bodyH} overflow="hidden">
          {events.length === 0 && !busy && (
            <Box flexDirection="column" marginTop={2} marginLeft={2}>
              <Text color={t.dim}>New session in </Text>
              <Text color={t.fg}>~/dev/nebula-api</Text>
              <Text> </Text>
              <Text color={t.faint}>Try: "Migrate auth middleware to the edge runtime"</Text>
              <Text color={t.faint}>Or type / to browse commands</Text>
            </Box>
          )}
          <Box flexGrow={1} />
          {visible.map((e) => (
            <EventView key={e.id} ev={e} expanded={expanded} isLast={e.id === lastId} />
          ))}
          {scroll > 0 && <Text color={t.yellow}>▼ {scroll} newer — PgDn</Text>}
        </Box>
        {showSidebar && <Sidebar height={bodyH} tokens={tokens} />}
      </Box>

      {/* palette + overlays float above input */}
      {showPalette && (
        <Box paddingX={1}>
          <Palette query={input} index={paletteIx} />
        </Box>
      )}
      {overlay === 'plan' && (
        <Box width={columns} justifyContent="center" paddingX={1}>
          <PlanOverlay width={columns} />
        </Box>
      )}
      {overlay === 'keys' && (
        <Box width={columns} justifyContent="center" paddingX={1}>
          <ShortcutsOverlay />
        </Box>
      )}
      {overlay === 'model' && (
        <Box width={columns} justifyContent="center" paddingX={1}>
          <ModelOverlay row={modelRow} effortIx={effortIx} currentIx={modelIx} />
        </Box>
      )}
      {overlay === 'theme' && (
        <Box width={columns} justifyContent="center" paddingX={1}>
          <ThemeOverlay row={themeRow} />
        </Box>
      )}

      {/* input */}
      <Box paddingX={1}>
        <InputBar
          value={input}
          mode={mode}
          busy={busy}
          width={columns - 2}
          model={models[modelIx]!.id}
        />
      </Box>
    </Box>
  );
}
