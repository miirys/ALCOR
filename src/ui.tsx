import React, { createContext, useContext } from 'react';
import { Box, Text } from 'ink';
import { Theme, defaultTheme, gradient, lerpHex } from './theme.ts';
import { useFrame } from './hooks.ts';

// ── theme context ────────────────────────────────────────────────────────

export const ThemeCtx = createContext<Theme>(defaultTheme);
export const useTheme = () => useContext(ThemeCtx);

/** True while the first Ctrl+C is armed — footers show the exit hint. */
export const ExitArmCtx = createContext(false);

/** Bottom-right corner: brand tag, or the exit warning while armed. */
export function CornerTag() {
  const t = useTheme();
  const armed = useContext(ExitArmCtx);
  if (armed) return <Text color={t.yellow}>Press Ctrl+C again to exit</Text>;
  return <Text color={t.faint}>ALCOR α</Text>;
}

// ── logo ─────────────────────────────────────────────────────────────────

export const LOGO = [
  ' █████╗ ██╗      ██████╗ ██████╗ ██████╗ ',
  '██╔══██╗██║     ██╔════╝██╔═══██╗██╔══██╗',
  '███████║██║     ██║     ██║   ██║██████╔╝',
  '██╔══██║██║     ██║     ██║   ██║██╔══██╗',
  '██║  ██║███████╗╚██████╗╚██████╔╝██║  ██║',
  '╚═╝  ╚═╝╚══════╝ ╚═════╝ ╚═════╝ ╚═╝  ╚═╝',
];

/**
 * The ALCOR wordmark with a slow "starlight" shimmer sweeping across it.
 * Alcor is the faint companion of Mizar in the Big Dipper — the ancient
 * eyesight test. The sweep is the identity animation of the harness.
 */
export function Logo({ dimmed = false }: { dimmed?: boolean }) {
  const t = useTheme();
  const frame = useFrame(14, !dimmed);
  const width = LOGO[0]!.length;
  const sweep = (frame * 2) % (width + 40) - 20; // moving highlight center
  return (
    <Box flexDirection="column">
      {LOGO.map((line, y) => (
        <Text key={y}>
          {[...line].map((ch, x) => {
            if (ch === ' ') return ' ';
            if (dimmed) return <Text key={x} color={t.faint}>{ch}</Text>;
            const d = Math.abs(x - sweep - y * 1.5);
            const glow = Math.max(0, 1 - d / 11);
            const base = lerpHex(t.faint, t.accentDim, 0.55);
            const color =
              glow > 0.65
                ? lerpHex(t.accent, t.bright, (glow - 0.65) * 2.4)
                : lerpHex(base, t.accent, glow / 0.65);
            return (
              <Text key={x} color={color}>
                {ch}
              </Text>
            );
          })}
        </Text>
      ))}
    </Box>
  );
}

/** Compact star-mark used in headers: ✦ ALCOR */
export function StarMark({ label = 'ALCOR' }: { label?: string }) {
  const t = useTheme();
  const frame = useFrame(3);
  const stars = ['✦', '✧', '✦', '·'];
  return (
    <Text>
      <Text color={t.accent}>{stars[frame % stars.length]} </Text>
      <Text color={t.bright} bold>
        {label}
      </Text>
    </Text>
  );
}

// ── spinners ─────────────────────────────────────────────────────────────

const ORBIT = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
const PULSE = ['◜', '◠', '◝', '◞', '◡', '◟'];
const STAR = ['✶', '✸', '✹', '✺', '✹', '✸'];

export function Spinner({
  kind = 'orbit',
  color,
}: {
  kind?: 'orbit' | 'pulse' | 'star';
  color?: string;
}) {
  const t = useTheme();
  const frame = useFrame(kind === 'star' ? 8 : 15);
  const frames = kind === 'orbit' ? ORBIT : kind === 'pulse' ? PULSE : STAR;
  return <Text color={color ?? t.accent}>{frames[frame % frames.length]}</Text>;
}

/** Animated "thinking" shimmer over a phrase, grok-style. */
export function ShimmerText({ text, active = true }: { text: string; active?: boolean }) {
  const t = useTheme();
  const frame = useFrame(18, active);
  if (!active) return <Text color={t.dim}>{text}</Text>;
  const sweep = (frame * 1.6) % (text.length + 24) - 12;
  return (
    <Text>
      {[...text].map((ch, i) => {
        const glow = Math.max(0, 1 - Math.abs(i - sweep) / 7);
        return (
          <Text key={i} color={lerpHex(t.dim, t.bright, glow)}>
            {ch}
          </Text>
        );
      })}
    </Text>
  );
}

// ── meters & bars ────────────────────────────────────────────────────────

/** Context meter, lives top-right like grok build's. */
export function ContextMeter({ used, max }: { used: number; max: number }) {
  const t = useTheme();
  const pct = Math.min(1, used / max);
  const cells = 10;
  const filled = Math.round(pct * cells);
  const color = gradient([t.green, t.yellow, t.red], pct);
  const fmt = (n: number) =>
    n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : `${n}`;
  return (
    <Text>
      <Text color={t.faint}>CTX </Text>
      <Text color={color}>{'▰'.repeat(filled)}</Text>
      <Text color={t.faint}>{'▱'.repeat(cells - filled)}</Text>
      <Text color={t.dim}>
        {' '}
        {fmt(used)}/{fmt(max)} · {Math.round(pct * 100)}%
      </Text>
    </Text>
  );
}

export function ProgressBar({
  value,
  width = 32,
  showPct = true,
}: {
  value: number; // 0..1
  width?: number;
  showPct?: boolean;
}) {
  const t = useTheme();
  const filled = Math.round(value * width);
  return (
    <Text>
      <Text color={t.accent}>{'━'.repeat(filled)}</Text>
      <Text color={t.faint}>{'━'.repeat(Math.max(0, width - filled))}</Text>
      {showPct && <Text color={t.dim}> {Math.round(value * 100)}%</Text>}
    </Text>
  );
}

// ── chrome ───────────────────────────────────────────────────────────────

export function Badge({
  label,
  color,
  fg,
}: {
  label: string;
  color?: string;
  fg?: string;
}) {
  const t = useTheme();
  return (
    <Text backgroundColor={color ?? t.selBg} color={fg ?? t.bright}>
      {' '}
      {label}{' '}
    </Text>
  );
}

export function Kbd({ k }: { k: string }) {
  const t = useTheme();
  return (
    <Text>
      <Text color={t.faint}>[</Text>
      <Text color={t.fg}>{k}</Text>
      <Text color={t.faint}>]</Text>
    </Text>
  );
}

export function Hint({ pairs }: { pairs: [string, string][] }) {
  const t = useTheme();
  return (
    <Text>
      {pairs.map(([k, d], i) => (
        <Text key={i}>
          {i > 0 && <Text color={t.faint}>  ·  </Text>}
          <Kbd k={k} />
          <Text color={t.dim}> {d}</Text>
        </Text>
      ))}
    </Text>
  );
}

export function Rule({ width, label }: { width: number; label?: string }) {
  const t = useTheme();
  if (!label) return <Text color={t.border}>{'─'.repeat(Math.max(0, width))}</Text>;
  const side = Math.max(0, Math.floor((width - label.length - 2) / 2));
  return (
    <Text color={t.border}>
      {'─'.repeat(side)} <Text color={t.dim}>{label}</Text>{' '}
      {'─'.repeat(Math.max(0, width - side - label.length - 2))}
    </Text>
  );
}

// ── select list ──────────────────────────────────────────────────────────

export interface SelectItem {
  key: string;
  render: (selected: boolean) => React.ReactNode;
}

export function SelectList({
  items,
  index,
}: {
  items: SelectItem[];
  index: number;
}) {
  const t = useTheme();
  return (
    <Box flexDirection="column">
      {items.map((it, i) => (
        <Box key={it.key}>
          <Text color={i === index ? t.accent : t.faint}>
            {i === index ? '▌ ' : '  '}
          </Text>
          {it.render(i === index)}
        </Box>
      ))}
    </Box>
  );
}
