import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { colors } from './colors';

/**
 * ALCOR theme registry. A theme swaps the identity accent (and message
 * highlights); the neutral greys and the semantic diff/state colors persist
 * across every theme so transcripts stay readable.
 */
export interface AlcorTheme {
  id: string;
  name: string;
  accent: string;
  accentDim: string;
  bright: string;
}

export const themes: AlcorTheme[] = [
  {
    id: 'alcor-night',
    name: 'Alcor Night',
    accent: '#e8e8ee',
    accentDim: '#8a8a94',
    bright: '#f4f4f5',
  },
  {
    id: 'alcor-violet',
    name: 'Alcor Violet',
    accent: '#bb9af7',
    accentDim: '#8a74b8',
    bright: '#d5c4fa',
  },
  { id: 'mizar', name: 'Mizar', accent: '#7aa2f7', accentDim: '#5a77b5', bright: '#a8c1fa' },
  { id: 'phosphor', name: 'Phosphor', accent: '#7fd962', accentDim: '#5d9e49', bright: '#a5e890' },
  { id: 'ember', name: 'Ember', accent: '#ff9e64', accentDim: '#bd7449', bright: '#ffbe98' },
  { id: 'rose', name: 'Rose', accent: '#ea9a97', accentDim: '#ad706e', bright: '#f2bcba' },
  { id: 'fjord', name: 'Fjord', accent: '#73daca', accentDim: '#549e93', bright: '#a1e8dd' },
];

const CONFIG_DIR = path.join(os.homedir(), '.alcor');
const CONFIG_FILE = path.join(CONFIG_DIR, 'ui.json');

let activeThemeId = 'alcor-night';

export const getThemeId = (): string => activeThemeId;

/** Apply a theme by mutating the shared `colors` palette in place. */
export function setTheme(id: string, persist = true): void {
  const theme = themes.find((t) => t.id === id);
  if (!theme) return;
  activeThemeId = theme.id;
  colors.accent = theme.accent;
  colors.accentDim = theme.accentDim;
  colors.bright = theme.bright;
  if (persist) {
    try {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
      let existing: Record<string, unknown> = {};
      try {
        existing = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as Record<string, unknown>;
      } catch {
        // first write
      }
      fs.writeFileSync(CONFIG_FILE, JSON.stringify({ ...existing, theme: theme.id }, null, 2));
    } catch {
      // Persistence is best-effort; the theme still applies for this session.
    }
  }
}

// Restore the persisted theme at module load, before the first render.
try {
  const saved = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) as { theme?: string };
  if (saved.theme) setTheme(saved.theme, false);
} catch {
  // No saved settings — Alcor Night stays active.
}
