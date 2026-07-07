import { readFileSync } from 'node:fs';
import { arch, platform } from 'node:os';

export type BunTarget =
  | 'bun-linux-x64'
  | 'bun-linux-x64-baseline'
  | 'bun-linux-arm64'
  | 'bun-windows-x64-modern'
  | 'bun-windows-x64-baseline'
  | 'bun-windows-arm64'
  | 'bun-darwin-arm64'
  | 'bun-darwin-x64-baseline';

export const APP_NAME = 'duo';

export const DEFAULT_TARGETS: BunTarget[] = [
  'bun-linux-x64',
  'bun-linux-x64-baseline',
  'bun-linux-arm64',
  'bun-windows-x64-modern',
  'bun-windows-x64-baseline',
  'bun-windows-arm64',
  'bun-darwin-arm64',
  'bun-darwin-x64-baseline',
];

export function getRgTripleFromTarget(target: BunTarget): string {
  switch (target) {
    case 'bun-linux-x64':
    case 'bun-linux-x64-baseline':
      return 'x86_64-unknown-linux-musl';
    case 'bun-linux-arm64':
      return 'aarch64-unknown-linux-musl';
    case 'bun-windows-x64-modern':
    case 'bun-windows-x64-baseline':
      return 'x86_64-pc-windows-msvc';
    case 'bun-windows-arm64':
      return 'aarch64-pc-windows-msvc';
    case 'bun-darwin-arm64':
      return 'aarch64-apple-darwin';
    case 'bun-darwin-x64-baseline':
      return 'x86_64-apple-darwin';
  }
}

export function getRgBinaryName(target: BunTarget): 'rg' | 'rg.exe' {
  return target.startsWith('bun-windows-') ? 'rg.exe' : 'rg';
}

export function getPlatformFromTarget(target: BunTarget): string {
  return target.replace(/^bun-/, '');
}

export function getExecutableName(platformSlug: string): string {
  let slug = platformSlug;
  let ext = '';

  // Per-platform filename adjustments:
  // - Windows binaries get a .exe extension
  // - Linux x64 naming is asymmetric for backward compatibility:
  //     bun-linux-x64           → duo-linux-x64-modern (opt-in, requires AVX2/BMI2/FMA)
  //     bun-linux-x64-baseline  → duo-linux-x64        (legacy filename, safe default)
  //   This differs from Windows (which uses -modern/-baseline symmetrically)
  //   because install_duo_cli.sh has always fetched duo-linux-x64; renaming
  //   it would break every cached copy of that script in the wild.
  if (slug.startsWith('windows-')) ext = '.exe';
  else if (slug === 'linux-x64') slug = 'linux-x64-modern';
  else if (slug === 'linux-x64-baseline') slug = 'linux-x64';

  return `${APP_NAME}-${slug}${ext}`;
}

// Auto-detect whether the current x86_64 Linux CPU supports Bun's "modern" x64
// build. Bun's modern target requires AVX2 (Haswell/Excavator and newer);
// without it the binary will SIGILL on hot paths. We err toward "baseline"
// whenever detection is ambiguous (no /proc/cpuinfo, no flags line, parse
// error) — false negatives cost a bit of perf, false positives crash.
function detectLinuxX64Variant(): 'modern' | 'baseline' {
  let cpuinfo: string;
  try {
    cpuinfo = readFileSync('/proc/cpuinfo', 'utf8');
  } catch {
    return 'baseline';
  }
  const match = cpuinfo.match(/^flags\s*:.*$/m);
  if (!match) return 'baseline';
  // Pad with spaces so a substring search for " avx2 " behaves as a
  // word-boundary check (avoids matching "avx2_vnni", and avoids "avx"
  // matching "avx2").
  const flags = ` ${match[0].slice(match[0].indexOf(':') + 1).trim()} `;
  return flags.includes(' avx2 ') ? 'modern' : 'baseline';
}

export function detectBunTarget(): BunTarget {
  const os = platform();
  const cpu = arch();
  if (os === 'darwin') {
    if (cpu === 'arm64') return 'bun-darwin-arm64';
    if (cpu === 'x64') return 'bun-darwin-x64-baseline';
    throw new Error(`Unsupported macOS architecture: ${cpu}`);
  }
  if (os === 'linux') {
    if (cpu === 'x64') {
      // bun-linux-x64 is the modern (AVX2) target; bun-linux-x64-baseline is the safe default.
      return detectLinuxX64Variant() === 'modern' ? 'bun-linux-x64' : 'bun-linux-x64-baseline';
    }
    if (cpu === 'arm64') return 'bun-linux-arm64';
    throw new Error(`Unsupported Linux architecture: ${cpu}`);
  }
  if (os === 'win32') {
    if (cpu === 'arm64') return 'bun-windows-arm64';
    // TODO: implement a way to distinguish between modern and baseline Windows x64 targets
    if (cpu === 'x64') return 'bun-windows-x64-baseline';
    throw new Error(`Unsupported Windows architecture: ${cpu}`);
  }
  throw new Error(`Unsupported OS: ${os}`);
}
