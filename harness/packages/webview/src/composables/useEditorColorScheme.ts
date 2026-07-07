import { onMounted, onUnmounted, ref } from 'vue';

const EDITOR_BACKGROUND = '--editor-background';

/**
 * Parses a CSS color (`#rgb`,  `#rrggbb`, or `rgb()/rgba()`) into its sRGB
 * channels. Returns `null` for anything we can't read — the theme only ever
 * sends these two forms for `--editor-background`.
 */
function parseRgb(value: string): [number, number, number] | null {
  const color = value.trim();

  const hex = /^#([\da-f]{3}|[\da-f]{6})$/i.exec(color)?.[1];
  if (hex) {
    const digits = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex;
    return [
      parseInt(digits.slice(0, 2), 16),
      parseInt(digits.slice(2, 4), 16),
      parseInt(digits.slice(4, 6), 16),
    ];
  }

  const rgb = /^rgba?\(([^)]+)\)$/i.exec(color)?.[1];
  if (rgb) {
    const [r, g, b] = rgb.split(/[,\s/]+/).map(Number);
    if (r !== undefined && g !== undefined && b !== undefined && [r, g, b].every(Number.isFinite)) {
      return [r, g, b];
    }
  }

  return null;
}

/**
 * Decides whether an editor background color reads as dark. Falls back to dark,
 * which matches the app's default theme, when the value can't be parsed.
 */
export function isDarkBackground(value: string): boolean {
  const rgb = parseRgb(value);
  if (!rgb) {
    return true;
  }

  const [r, g, b] = rgb;
  const luminance = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return luminance < 0.5;
}

/*
  The editor theme is global, so the dark/light signal is shared module state: a
  single `MutationObserver` and `ref` back every consumer instead of one per
  component. The observer is started on first mount and torn down once the last
  consumer unmounts.
*/
const isDark = ref(true);
let observer: MutationObserver | null = null;
let consumers = 0;

function update() {
  const background = getComputedStyle(document.documentElement).getPropertyValue(EDITOR_BACKGROUND);
  isDark.value = isDarkBackground(background);
}

function start() {
  if (consumers++ > 0) {
    return;
  }
  update();
  observer = new MutationObserver(update);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
}

function stop() {
  if (--consumers > 0) {
    return;
  }
  observer?.disconnect();
  observer = null;
}

/**
 * Tracks whether the active editor theme is dark by inspecting the resolved
 * `--editor-background` variable. The webview receives no explicit light/dark
 * flag — the theme is delivered purely as `--editor-*` color values on
 * `documentElement` — so we derive it and re-evaluate whenever those change.
 */
export function useEditorColorScheme() {
  onMounted(start);
  onUnmounted(stop);

  return { isDark };
}
