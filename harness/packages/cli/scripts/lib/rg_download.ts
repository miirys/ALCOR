import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { platform } from 'node:os';
import { resolve } from 'node:path';

import { log } from '../../../../scripts/lib/deploy_log';
import { type BunTarget, getRgBinaryName, getRgTripleFromTarget } from './build_targets';
import { runSubprocess } from './bun_compile';

const RELEASE_BASE = 'https://github.com/microsoft/ripgrep-prebuilt/releases/download';

export interface DownloadRgOptions {
  rgDir: string;
  rgVersion: string;
  targets: BunTarget[];
}

// Cross-platform replacement for scripts/download_rg_binaries.sh. Downloads
// the per-target ripgrep prebuilt archives, then extracts the single binary
// we need into `<rgDir>/<rgVersion>/<triple>/`.
export async function downloadRgBinaries(opts: DownloadRgOptions): Promise<void> {
  // Resolve to an absolute path: Bun's fs.mkdirSync({ recursive: true }) on
  // Windows can throw EEXIST for relative paths containing '..' segments.
  const rgDir = resolve(opts.rgDir);
  const { rgVersion, targets } = opts;

  log.info(`Downloading rg binaries for all targets (rg ${rgVersion})`);
  mkdirSync(rgDir, { recursive: true });

  // Many bun targets share a single rg triple (e.g. linux-x64 + linux-x64-baseline
  // both map to x86_64-unknown-linux-musl). De-dupe so we only download each triple once.
  const triples = new Map<string, 'rg' | 'rg.exe'>();
  for (const target of targets) {
    triples.set(getRgTripleFromTarget(target), getRgBinaryName(target));
  }

  const failed: string[] = [];
  for (const [triple, binary] of triples) {
    try {
      await downloadRgForTriple({ triple, binary, rgDir, rgVersion });
    } catch (err) {
      log.error(`Failed to download rg for ${triple}: ${(err as Error).message}`);
      failed.push(triple);
    }
  }

  if (failed.length > 0) {
    throw new Error(`Failed to download rg for triples: ${failed.join(' ')}`);
  }
  log.info('All rg binaries downloaded successfully');
}

interface DownloadOne {
  triple: string;
  binary: 'rg' | 'rg.exe';
  rgDir: string;
  rgVersion: string;
}

async function downloadRgForTriple(opts: DownloadOne): Promise<void> {
  const { triple, binary, rgDir, rgVersion } = opts;
  const isWindowsTriple = triple.includes('-windows-');
  const archiveExt: ArchiveExt = isWindowsTriple ? 'zip' : 'tar.gz';

  const tripleDir = `${rgDir}/${rgVersion}/${triple}`;
  const dest = `${tripleDir}/${binary}`;

  if (existsSync(dest)) {
    log.info(`rg ${rgVersion} already downloaded for ${triple}, skipping`);
    return;
  }

  mkdirSync(tripleDir, { recursive: true });

  const archiveName = `ripgrep-${rgVersion}-${triple}.${archiveExt}`;
  const url = `${RELEASE_BASE}/${rgVersion}/${archiveName}`;
  const tmpArchive = `${tripleDir}/${archiveName}`;

  log.info(`Downloading rg for ${triple} from ${url}`);
  const start = Date.now();

  await fetchToFile(url, tmpArchive);
  try {
    await extractBinary({ archivePath: tmpArchive, archiveExt, binary, destDir: tripleDir });
  } finally {
    rmSync(tmpArchive, { force: true });
  }

  log.info(`rg downloaded to ${dest} (${Math.round((Date.now() - start) / 1000)}s)`);
}

async function fetchToFile(url: string, destPath: string): Promise<void> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} ${response.statusText} fetching ${url}`);
  }
  const buffer = Buffer.from(await response.arrayBuffer());
  writeFileSync(destPath, buffer);
}

type ArchiveExt = 'tar.gz' | 'zip';

interface ExtractOptions {
  archivePath: string;
  archiveExt: ArchiveExt;
  binary: 'rg' | 'rg.exe';
  destDir: string;
}

// Extracts a single named binary from the archive into destDir.
//
// `.tar.gz` is handled by `tar -xzf` everywhere (GNU tar on Linux, bsdtar on
// Windows 10+ and macOS).
//
// `.zip` is the tricky one: GNU tar can't read zip, so on Linux we use
// `unzip`. On macOS and Windows, bsdtar reads zips natively via `tar -xf`,
// which keeps us off `unzip` (absent on Windows) and PowerShell.
async function extractBinary(opts: ExtractOptions): Promise<void> {
  const { archivePath, archiveExt, binary, destDir } = opts;

  if (archiveExt === 'tar.gz') {
    await runSubprocess('tar', ['-xzf', archivePath, '-C', destDir, binary]);
    return;
  }

  if (platform() === 'linux') {
    await runSubprocess('unzip', ['-q', '-o', archivePath, binary, '-d', destDir]);
  } else {
    await runSubprocess('tar', ['-xf', archivePath, '-C', destDir, binary]);
  }
}
