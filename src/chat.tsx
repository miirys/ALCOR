import React from 'react';
import { Box, Text } from 'ink';
import type { Event, ToolEvent, TextEvent, PermEvent, FileDiff, ToolKind } from './mock/data.ts';
import { imagineArt, mcpServers } from './mock/data.ts';
import { Spinner, ShimmerText, ProgressBar, useTheme } from './ui.tsx';
import { useTypewriter, useFrame } from './hooks.ts';

// ── diff rendering ───────────────────────────────────────────────────────

export function Diff({ diff, maxLines }: { diff: FileDiff; maxLines?: number }) {
  const t = useTheme();
  const lines = maxLines ? diff.lines.slice(0, maxLines) : diff.lines;
  const truncated = maxLines != null && diff.lines.length > maxLines;
  const num = (n?: number) => (n == null ? '    ' : String(n).padStart(4));
  return (
    <Box flexDirection="column">
      {lines.map((l, i) => {
        if (l.kind === 'hunk')
          return (
            <Text key={i} color={t.cyan} dimColor>
              {'  '}{l.text}
            </Text>
          );
        const sign = l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' ';
        const color = l.kind === 'add' ? t.green : l.kind === 'del' ? t.red : t.dim;
        const bg = l.kind === 'add' ? t.addBg : l.kind === 'del' ? t.delBg : undefined;
        return (
          <Text key={i}>
            <Text color={t.faint}>
              {num(l.old)} {num(l.new)}{' '}
            </Text>
            <Text color={color} backgroundColor={bg}>
              {sign} {l.text}
            </Text>
          </Text>
        );
      })}
      {truncated && (
        <Text color={t.faint}>
          {'          '}… {diff.lines.length - maxLines!} more lines <Text color={t.dim}>(ctrl+o expands)</Text>
        </Text>
      )}
    </Box>
  );
}

export function DiffStat({ add, del }: { add: number; del: number }) {
  const t = useTheme();
  return (
    <Text>
      <Text color={t.green}>+{add}</Text> <Text color={t.red}>−{del}</Text>
    </Text>
  );
}

// ── tool cards ───────────────────────────────────────────────────────────

const TOOL_ICON: Record<ToolKind, string> = {
  bash: '❯_',
  read: '◈',
  edit: '±',
  write: '✎',
  rm: '✕',
  search: '⌕',
  task: '⑂',
  todo: '☰',
  plan: '▤',
  imagine: '❉',
  compact: '⇲',
  mcp: '⌘',
};

const TOOL_LABEL: Record<ToolKind, string> = {
  bash: 'shell',
  read: 'read',
  edit: 'edit',
  write: 'write',
  rm: 'delete',
  search: 'search',
  task: 'agent',
  todo: 'todos',
  plan: 'plan',
  imagine: 'imagine',
  compact: 'compact',
  mcp: 'mcp',
};

/** Permission card — "allow once / always / reject", diff preview inline. */
export function PermCard({ ev }: { ev: PermEvent }) {
  const t = useTheme();
  const asking = ev.state === 'ask';
  const frame = useFrame(4, asking);
  const borderColor = asking
    ? frame % 2 === 0
      ? t.yellow
      : t.accentDim
    : ev.state === 'rejected'
      ? t.red
      : t.border;
  const verdict =
    ev.state === 'allowed'
      ? ['✓ allowed once', t.green]
      : ev.state === 'always'
        ? ['✓ always allowed for this session', t.green]
        : ev.state === 'auto'
          ? ['✓ auto-approved (AUTO mode)', t.green]
          : ev.state === 'rejected'
            ? ['✗ rejected — agent will re-plan', t.red]
            : null;
  return (
    <Box
      flexDirection="column"
      marginLeft={2}
      marginTop={1}
      borderStyle="round"
      borderColor={borderColor}
      paddingX={1}
      width={64}
    >
      <Box>
        <Text color={asking ? t.yellow : t.dim} bold>
          {asking ? '⚿ permission' : '⚿'}
        </Text>
        <Text color={t.fg}> · {ev.action}</Text>
      </Box>
      {asking && ev.diff && (
        <Box flexDirection="column" marginTop={0}>
          <Diff diff={ev.diff} maxLines={5} />
        </Box>
      )}
      {asking ? (
        <Box marginTop={0} columnGap={2}>
          <Text>
            <Text color={t.green} bold>[y]</Text>
            <Text color={t.fg}> allow once</Text>
          </Text>
          <Text>
            <Text color={t.cyan} bold>[a]</Text>
            <Text color={t.fg}> always</Text>
          </Text>
          <Text>
            <Text color={t.red} bold>[n]</Text>
            <Text color={t.fg}> reject</Text>
          </Text>
        </Box>
      ) : (
        verdict && <Text color={verdict[1]!}>{verdict[0]}</Text>
      )}
    </Box>
  );
}

/** /imagine — progressive block-art "render" with scan line. */
function ImagineBody({ running }: { running: boolean }) {
  const t = useTheme();
  const frame = useFrame(10, running);
  const shown = running ? Math.min(imagineArt.length, Math.floor(frame / 3) + 1) : imagineArt.length;
  return (
    <Box flexDirection="column" marginLeft={4}>
      <Box flexDirection="column" borderStyle="round" borderColor={t.border} paddingX={1}>
        {imagineArt.slice(0, shown).map((row, i) => (
          <Text key={i}>
            {[...row].map((ch, x) => {
              const star = ch === '✦' || ch === '✧' || ch === '★';
              return (
                <Text
                  key={x}
                  color={
                    star
                      ? t.accent
                      : ch === '█'
                        ? t.bright
                        : ch === '▓'
                          ? t.fg
                          : ch === '▒'
                            ? t.dim
                            : t.faint
                  }
                >
                  {ch}
                </Text>
              );
            })}
          </Text>
        ))}
        {running && shown < imagineArt.length && (
          <Text color={t.accent}>{'▔'.repeat(43)}</Text>
        )}
      </Box>
      <Text color={t.faint}>
        {running
          ? `rendering… ${Math.round((shown / imagineArt.length) * 100)}%`
          : '"the seeing test" · 1024×1024 · saved .alcor/images/uma-chart.png'}
      </Text>
    </Box>
  );
}

/** /compact — context squeeze animation. */
function CompactBody({ running, durationMs }: { running: boolean; durationMs: number }) {
  const t = useTheme();
  const frame = useFrame(15, running);
  const p = running ? Math.min(1, (frame * 66) / durationMs) : 1;
  const kept = Math.round(100 - p * 62);
  return (
    <Box flexDirection="column" marginLeft={4}>
      <Box>
        <ProgressBar value={p} width={28} showPct={false} />
        <Text color={t.dim}> {kept}% of context {running ? '' : '· done'}</Text>
      </Box>
      <Text color={t.faint}>
        {running ? 'folding scrollback, keeping decisions & diffs…' : 'kept: plan, 4 diffs, test results · dropped: raw tool output'}
      </Text>
    </Box>
  );
}

/** /mcp — server table card. */
function McpBody() {
  const t = useTheme();
  return (
    <Box flexDirection="column" marginLeft={4}>
      {mcpServers.map((s) => (
        <Box key={s.name}>
          <Text color={s.state === 'ok' ? t.green : t.red}>{s.state === 'ok' ? '● ' : '○ '}</Text>
          <Box width={12}>
            <Text color={t.fg}>{s.name}</Text>
          </Box>
          <Box width={7}>
            <Text color={t.dim}>{s.lat}</Text>
          </Box>
          <Text color={t.faint}>
            {s.state === 'ok' ? `${s.tools} tools` : 'unreachable · retrying in 30s'}
          </Text>
        </Box>
      ))}
    </Box>
  );
}

export function ToolCard({ ev, expanded }: { ev: ToolEvent; expanded: boolean }) {
  const t = useTheme();
  const running = ev.state === 'running';
  const statusIcon = running ? (
    <Spinner kind="orbit" />
  ) : ev.state === 'error' ? (
    <Text color={t.red}>✗</Text>
  ) : (
    <Text color={t.green}>✓</Text>
  );

  return (
    <Box flexDirection="column" marginLeft={2} marginBottom={0}>
      {/* header row */}
      <Box>
        <Text color={t.faint}>│ </Text>
        {statusIcon}
        <Text color={t.accentDim}> {TOOL_ICON[ev.tool]} </Text>
        <Text color={t.dim}>{TOOL_LABEL[ev.tool]}</Text>
        <Text color={t.faint}> · </Text>
        <Text color={running ? t.fg : t.bright}>{ev.title}</Text>
        {ev.meta && !running && (
          <Text color={t.faint}>  {ev.meta}</Text>
        )}
        {running && (
          <Text color={t.faint}>  {(ev.durationMs / 1000).toFixed(1)}s…</Text>
        )}
      </Box>

      {/* body */}
      {!running && ev.detail && (expanded ? ev.detail : ev.detail.slice(0, 2)).map((d, i) => (
        <Box key={i}>
          <Text color={t.faint}>│   </Text>
          <Text color={t.dim}>{d}</Text>
        </Box>
      ))}
      {!running && ev.detail && !expanded && ev.detail.length > 2 && (
        <Box>
          <Text color={t.faint}>│   … {ev.detail.length - 2} more</Text>
        </Box>
      )}

      {!running && ev.diff && (
        <Box flexDirection="column" marginLeft={2} marginTop={0}>
          <Diff diff={ev.diff} maxLines={expanded ? undefined : 6} />
        </Box>
      )}

      {ev.tool === 'imagine' && <ImagineBody running={running} />}
      {ev.tool === 'compact' && <CompactBody running={running} durationMs={ev.durationMs} />}
      {ev.tool === 'mcp' && !running && <McpBody />}

      {ev.todos && (
        <Box flexDirection="column">
          {ev.todos.map((td, i) => (
            <Box key={i}>
              <Text color={t.faint}>│   </Text>
              <Text
                color={
                  td.state === 'done' ? t.green : td.state === 'active' ? t.accent : t.faint
                }
              >
                {td.state === 'done' ? '◉' : td.state === 'active' ? '◐' : '○'}{' '}
              </Text>
              <Text
                color={td.state === 'done' ? t.dim : td.state === 'active' ? t.bright : t.dim}
                strikethrough={td.state === 'done'}
              >
                {td.text}
              </Text>
            </Box>
          ))}
        </Box>
      )}

      {/* nested subagent trace */}
      {ev.sub && (
        <Box flexDirection="column" marginLeft={2}>
          <Box>
            <Text color={t.faint}>│ ┌ </Text>
            <Text color={t.magenta}>⑂ {ev.sub.name}</Text>
            {running && (
              <Text>
                {' '}
                <Spinner kind="pulse" color={t.magenta} />
              </Text>
            )}
          </Box>
          {(running ? ev.sub.lines.slice(0, 1) : ev.sub.lines).map((l, i) => (
            <Box key={i}>
              <Text color={t.faint}>│ │ </Text>
              <Text color={l.startsWith('✓') ? t.green : t.dim}>{l}</Text>
            </Box>
          ))}
          {!running && (
            <Box>
              <Text color={t.faint}>│ └ </Text>
              <Text color={t.faint}>trace foldable · ctrl+o</Text>
            </Box>
          )}
        </Box>
      )}
    </Box>
  );
}

// ── text events ──────────────────────────────────────────────────────────

export function UserMsg({ ev }: { ev: TextEvent }) {
  const t = useTheme();
  return (
    <Box marginTop={1}>
      <Text color={t.accent}>▍ </Text>
      <Text color={t.bright}>{ev.text}</Text>
    </Box>
  );
}

/** Renders inline `code` spans in assistant prose. */
function Prose({ text }: { text: string }) {
  const t = useTheme();
  const parts = text.split(/(`[^`]+`)/g);
  return (
    <Text color={t.fg}>
      {parts.map((p, i) =>
        p.startsWith('`') && p.endsWith('`') ? (
          <Text key={i} color={t.cyan}>
            {p.slice(1, -1)}
          </Text>
        ) : (
          <Text key={i}>{p}</Text>
        ),
      )}
    </Text>
  );
}

export function AssistantMsg({ ev, streaming }: { ev: TextEvent; streaming: boolean }) {
  const t = useTheme();
  const { visible, done } = useTypewriter(ev.text, 260, streaming);
  return (
    <Box marginTop={1} marginLeft={2} flexDirection="column">
      <Box>
        <Text color={t.faint}>◆ </Text>
        <Box flexDirection="column" flexShrink={1}>
          <Prose text={streaming ? visible + (done ? '' : '▋') : ev.text} />
        </Box>
      </Box>
    </Box>
  );
}

export function Thinking({ ev, active }: { ev: TextEvent; active: boolean }) {
  const t = useTheme();
  return (
    <Box marginTop={1} marginLeft={2}>
      {active ? <Spinner kind="star" /> : <Text color={t.faint}>✦</Text>}
      <Text> </Text>
      <ShimmerText text={ev.text} active={active} />
    </Box>
  );
}

export function TurnEnd({ ev }: { ev: TextEvent }) {
  const t = useTheme();
  return (
    <Box marginTop={1} marginLeft={2}>
      <Text color={t.faint}>── turn completed in </Text>
      <Text color={t.dim}>{ev.text}</Text>
      <Text color={t.faint}> ──</Text>
    </Box>
  );
}

export function Notice({ ev }: { ev: TextEvent }) {
  const t = useTheme();
  return (
    <Box marginTop={1} marginLeft={2}>
      <Text color={t.yellow}>◇ {ev.text}</Text>
    </Box>
  );
}

// ── event switch ─────────────────────────────────────────────────────────

export function EventView({
  ev,
  expanded,
  isLast,
}: {
  ev: Event;
  expanded: boolean;
  isLast: boolean;
}) {
  switch (ev.type) {
    case 'user':
      return <UserMsg ev={ev} />;
    case 'assistant':
      return <AssistantMsg ev={ev} streaming={isLast} />;
    case 'thinking':
      return <Thinking ev={ev} active={isLast} />;
    case 'turn-end':
      return <TurnEnd ev={ev} />;
    case 'notice':
      return <Notice ev={ev} />;
    case 'tool':
      return <ToolCard ev={ev} expanded={expanded} />;
    case 'perm':
      return <PermCard ev={ev} />;
  }
}
