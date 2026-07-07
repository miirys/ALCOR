/**
 * ALCOR theme system.
 * Default theme "Alcor Night" is monochrome-leaning: near-black canvas,
 * a ladder of grays for chrome, and a single lavender accent that carries
 * all the identity — plus semantic colors reserved for diffs & state.
 */

export interface Theme {
  name: string;
  id: string;
  bg: string; // canvas
  fg: string; // primary text
  bright: string; // emphasized text
  dim: string; // secondary text
  faint: string; // tertiary / hints
  border: string; // panel borders
  borderActive: string; // focused borders
  accent: string; // identity color
  accentDim: string;
  green: string;
  red: string;
  yellow: string;
  cyan: string;
  blue: string;
  magenta: string;
  addBg: string; // diff added line tint
  delBg: string; // diff deleted line tint
  selBg: string; // selection background
}

export const themes: Theme[] = [
  {
    name: 'Alcor Night',
    id: 'alcor-night',
    bg: '#0a0a0a',
    fg: '#c9c9d1',
    bright: '#f4f4f5',
    dim: '#71717a',
    faint: '#44444c',
    border: '#27272a',
    borderActive: '#52525b',
    accent: '#bb9af7',
    accentDim: '#6d5aa3',
    green: '#9ece6a',
    red: '#f7768e',
    yellow: '#e0af68',
    cyan: '#7dcfff',
    blue: '#7aa2f7',
    magenta: '#bb9af7',
    addBg: '#16211a',
    delBg: '#251418',
    selBg: '#1c1c22',
  },
  {
    name: 'Mizar',
    id: 'mizar',
    bg: '#060a0e',
    fg: '#c4ccd4',
    bright: '#eef4fa',
    dim: '#68737e',
    faint: '#3c454f',
    border: '#1d262f',
    borderActive: '#46596b',
    accent: '#7dcfff',
    accentDim: '#3f7a99',
    green: '#8fd6a4',
    red: '#f78c9c',
    yellow: '#e5c07b',
    cyan: '#7dcfff',
    blue: '#82aaff',
    magenta: '#c792ea',
    addBg: '#0e2118',
    delBg: '#241318',
    selBg: '#12202b',
  },
  {
    name: 'Phosphor',
    id: 'phosphor',
    bg: '#050805',
    fg: '#a8c8a8',
    bright: '#dcf5dc',
    dim: '#5e755e',
    faint: '#374637',
    border: '#1c281c',
    borderActive: '#3f5a3f',
    accent: '#7ee787',
    accentDim: '#3f8a48',
    green: '#7ee787',
    red: '#ff9c8a',
    yellow: '#d9c97c',
    cyan: '#8adfd4',
    blue: '#8ab6df',
    magenta: '#c8a8dc',
    addBg: '#0e2412',
    delBg: '#231512',
    selBg: '#0f1c0f',
  },
  {
    name: 'Graphite',
    id: 'graphite',
    bg: '#0c0c0c',
    fg: '#c0c0c0',
    bright: '#ffffff',
    dim: '#6f6f6f',
    faint: '#454545',
    border: '#262626',
    borderActive: '#5a5a5a',
    accent: '#e6e6e6',
    accentDim: '#8a8a8a',
    green: '#a3be8c',
    red: '#bf616a',
    yellow: '#d0b47c',
    cyan: '#88c0d0',
    blue: '#81a1c1',
    magenta: '#b48ead',
    addBg: '#141d14',
    delBg: '#211414',
    selBg: '#1a1a1a',
  },
];

export const defaultTheme = themes[0]!;

// ── color math (for shimmer sweeps & meters) ─────────────────────────────

export function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const c = (n: number) =>
    Math.max(0, Math.min(255, Math.round(n)))
      .toString(16)
      .padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear interpolation between two hex colors, t in [0,1]. */
export function lerpHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex(ar + (br - ar) * t, ag + (bg - ag) * t, ab + (bb - ab) * t);
}

/** Multi-stop gradient sample, t in [0,1]. */
export function gradient(stops: string[], t: number): string {
  if (stops.length === 1) return stops[0]!;
  const scaled = Math.min(0.9999, Math.max(0, t)) * (stops.length - 1);
  const i = Math.floor(scaled);
  return lerpHex(stops[i]!, stops[i + 1]!, scaled - i);
}
