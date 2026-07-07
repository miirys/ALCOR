import React, { useEffect, useState } from 'react';
import { Box, Text } from 'ink';
import { Logo, ProgressBar, Spinner, useTheme } from '../ui.tsx';
import { useFrame, useTermSize } from '../hooks.ts';
import { bootLines } from '../mock/data.ts';

/**
 * Boot splash: shimmering wordmark, staged boot log, progress sweep.
 * Auto-advances to the main menu when "warm".
 */
export function Splash({ onDone }: { onDone: () => void }) {
  const t = useTheme();
  const { columns, rows } = useTermSize();
  const [step, setStep] = useState(0);
  const frame = useFrame(30);
  const progress = Math.min(1, frame / 55);

  useEffect(() => {
    const ids = bootLines.map((_, i) =>
      setTimeout(() => setStep(i + 1), 260 + i * 300),
    );
    const done = setTimeout(onDone, 260 + bootLines.length * 300 + 700);
    return () => {
      ids.forEach(clearTimeout);
      clearTimeout(done);
    };
  }, [onDone]);

  return (
    <Box
      width={columns}
      height={rows}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
    >
      <Logo />
      <Box marginTop={1}>
        <Text color={t.dim}>agent harness · </Text>
        <Text color={t.accentDim}>80 UMa</Text>
        <Text color={t.faint}> · the seeing test</Text>
      </Box>

      <Box marginTop={2} flexDirection="column" alignItems="flex-start" width={46}>
        {bootLines.slice(0, step).map((l, i) => (
          <Box key={i}>
            <Text color={t.green}>✓ </Text>
            <Text color={t.dim}>{l}</Text>
          </Box>
        ))}
        {step < bootLines.length && (
          <Box>
            <Spinner kind="orbit" />
            <Text color={t.faint}> {bootLines[step]?.split('·')[0]?.trim() ?? 'warming up'}…</Text>
          </Box>
        )}
      </Box>

      <Box marginTop={2}>
        <ProgressBar value={progress} width={46} showPct={false} />
      </Box>
      <Box marginTop={1}>
        <Text color={t.faint}>v0.1.0 · bun/node · press any key to skip</Text>
      </Box>
    </Box>
  );
}
