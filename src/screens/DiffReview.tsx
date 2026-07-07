import React, { useState } from 'react';
import { Box, Text, useInput } from 'ink';
import { Hint, Rule, useTheme } from '../ui.tsx';
import { Diff, DiffStat } from '../chat.tsx';
import { useTermSize } from '../hooks.ts';
import { fileDiffs } from '../mock/data.ts';

/**
 * Full-screen diff review: file tree on the left, patch on the right.
 * Per-file approve/reject — the grok-build "file-level approval" flow.
 */
export function DiffReview({ onBack }: { onBack: () => void }) {
  const t = useTheme();
  const { columns, rows } = useTermSize();
  const [ix, setIx] = useState(0);
  const [verdicts, setVerdicts] = useState<Record<string, 'ok' | 'no' | undefined>>({});
  const [scroll, setScroll] = useState(0);

  const file = fileDiffs[ix]!;
  const totalAdd = fileDiffs.reduce((a, d) => a + d.add, 0);
  const totalDel = fileDiffs.reduce((a, d) => a + d.del, 0);
  const decided = Object.values(verdicts).filter(Boolean).length;

  useInput((ch, key) => {
    if (key.escape || ch === 'q') return onBack();
    if (key.downArrow || ch === 'j') {
      setIx((i) => Math.min(fileDiffs.length - 1, i + 1));
      setScroll(0);
    }
    if (key.upArrow || ch === 'k') {
      setIx((i) => Math.max(0, i - 1));
      setScroll(0);
    }
    if (key.pageDown) setScroll((s) => s + 4);
    if (key.pageUp) setScroll((s) => Math.max(0, s - 4));
    if (ch === 'a') setVerdicts((v) => ({ ...v, [file.path]: 'ok' }));
    if (ch === 'r') setVerdicts((v) => ({ ...v, [file.path]: 'no' }));
    if (ch === 'A') {
      const all: Record<string, 'ok'> = {};
      for (const f of fileDiffs) all[f.path] = 'ok';
      setVerdicts(all);
    }
  });

  const bodyH = rows - 4;
  const treeW = 36;
  const patchW = columns - treeW - 4;
  const patchLines = file.lines.slice(scroll, scroll + bodyH - 4);

  return (
    <Box width={columns} height={rows} flexDirection="column" paddingX={1}>
      <Box justifyContent="space-between">
        <Text>
          <Text color={t.bright} bold>
            ± diff review
          </Text>
          <Text color={t.faint}> · {fileDiffs.length} files · </Text>
          <DiffStat add={totalAdd} del={totalDel} />
        </Text>
        <Text color={t.dim}>
          {decided}/{fileDiffs.length} decided
        </Text>
      </Box>
      <Rule width={columns - 2} />

      <Box flexGrow={1} columnGap={1}>
        {/* file tree */}
        <Box
          flexDirection="column"
          width={treeW}
          height={bodyH}
          borderStyle="round"
          borderColor={t.border}
          paddingX={1}
          overflow="hidden"
        >
          {fileDiffs.map((f, i) => {
            const sel = i === ix;
            const sc = f.status === 'A' ? t.green : f.status === 'D' ? t.red : t.yellow;
            const v = verdicts[f.path];
            const parts = f.path.split('/');
            const name = parts.pop()!;
            return (
              <Box key={f.path} flexDirection="column">
                <Box>
                  <Text color={sel ? t.accent : t.faint}>{sel ? '▌' : ' '}</Text>
                  <Text color={sc}> {f.status} </Text>
                  <Text color={sel ? t.bright : t.fg} bold={sel}>
                    {name}
                  </Text>
                  {v === 'ok' && <Text color={t.green}> ✓</Text>}
                  {v === 'no' && <Text color={t.red}> ✗</Text>}
                </Box>
                <Box marginLeft={4} justifyContent="space-between">
                  <Text color={t.faint}>{parts.join('/')}/</Text>
                  <DiffStat add={f.add} del={f.del} />
                </Box>
              </Box>
            );
          })}
          <Box flexGrow={1} />
          <Text color={t.faint}>a approve · r reject · A all</Text>
        </Box>

        {/* patch pane */}
        <Box
          flexDirection="column"
          width={patchW}
          height={bodyH}
          borderStyle="round"
          borderColor={t.borderActive}
          paddingX={1}
          overflow="hidden"
        >
          <Box justifyContent="space-between">
            <Text color={t.bright}>{file.path}</Text>
            <Text>
              <DiffStat add={file.add} del={file.del} />
              {scroll > 0 && <Text color={t.faint}>  ↑{scroll}</Text>}
            </Text>
          </Box>
          <Text color={t.faint}>{'─'.repeat(Math.max(0, patchW - 4))}</Text>
          <Diff diff={{ ...file, lines: patchLines }} />
        </Box>
      </Box>

      <Box justifyContent="space-between">
        <Hint
          pairs={[
            ['↑↓', 'file'],
            ['pgup/pgdn', 'scroll patch'],
            ['a/r', 'approve / reject'],
            ['esc', 'back'],
          ]}
        />
        <Text color={t.faint}>ALCOR α</Text>
      </Box>
    </Box>
  );
}
