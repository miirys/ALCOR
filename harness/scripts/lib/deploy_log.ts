// TypeScript counterpart to scripts/lib/deploy_log.sh.
// Provides log helpers and a summary table for deploy/build scripts.
//
// Usage:
//   import { log, summary } from '../../scripts/lib/deploy_log';
//   log.section('Publishing tarball');
//   summary.start('gitlab-lsp deploy');
//   summary.add('NPM publish', 'ok', 'uploaded foo');
//   process.exit(summary.print() ? 0 : 1);

const useColor = process.stdout.isTTY || Boolean(process.env.CI);

const C = {
  reset: useColor ? '\x1b[0m' : '',
  bold: useColor ? '\x1b[1m' : '',
  dim: useColor ? '\x1b[2m' : '',
  red: useColor ? '\x1b[31m' : '',
  green: useColor ? '\x1b[32m' : '',
  yellow: useColor ? '\x1b[33m' : '',
  blue: useColor ? '\x1b[34m' : '',
  cyan: useColor ? '\x1b[36m' : '',
};

const ts = (): string => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export const log = {
  section(msg: string): void {
    process.stdout.write(`\n${C.bold}${C.blue}==== ${msg} ====${C.reset}\n`);
  },
  info(msg: string): void {
    process.stdout.write(`${C.cyan}[INFO ]${C.reset} ${ts()} ${msg}\n`);
  },
  ok(msg: string): void {
    process.stdout.write(`${C.green}[OK   ]${C.reset} ${ts()} ${msg}\n`);
  },
  warn(msg: string): void {
    process.stdout.write(`${C.yellow}[WARN ]${C.reset} ${ts()} ${msg}\n`);
  },
  error(msg: string): void {
    process.stderr.write(`${C.red}[ERROR]${C.reset} ${ts()} ${msg}\n`);
  },
  debug(msg: string): void {
    if (process.env.DEBUG) {
      process.stdout.write(`${C.dim}[DEBUG]${C.reset} ${ts()} ${msg}\n`);
    }
  },

  // Run an async unit of work, log it, and time it. Returns the resolved value
  // when the work succeeds and rethrows on failure so callers can `try/catch`.
  async run<T>(label: string, work: () => Promise<T>): Promise<T> {
    log.info(`$ ${label}`);
    const start = Date.now();
    try {
      const result = await work();
      log.ok(`(exit 0, ${Math.round((Date.now() - start) / 1000)}s) ${label}`);
      return result;
    } catch (err) {
      log.error(`(exit nonzero, ${Math.round((Date.now() - start) / 1000)}s) ${label}`);
      throw err;
    }
  },
};

type Status = 'ok' | 'fail' | 'skip' | 'info';

interface Entry {
  step: string;
  status: Status;
  detail: string;
}

class Summary {
  private title = '';
  private dryRun = false;
  private entries: Entry[] = [];
  private hasFail = false;

  start(title: string, dryRun = false): void {
    this.title = title;
    this.dryRun = dryRun;
    this.entries = [];
    this.hasFail = false;
  }

  add(step: string, status: Status, detail = ''): void {
    if (status === 'fail') this.hasFail = true;
    this.entries.push({ step, status, detail });

    const suffix = detail ? ` — ${detail}` : '';
    switch (status) {
      case 'ok':
        log.ok(`[summary] ${step}${suffix}`);
        break;
      case 'fail':
        log.error(`[summary] ${step}${suffix}`);
        break;
      case 'skip':
        log.warn(`[summary] ${step} (skipped)${suffix}`);
        break;
      default:
        log.info(`[summary] ${step}${suffix}`);
    }
  }

  // Prints the summary table and returns `true` on success, `false` if any step failed.
  print(): boolean {
    const dryNote = this.dryRun ? ' (dry-run)' : '';
    process.stdout.write(
      `\n${C.bold}${C.blue}===== ${this.title} — summary${dryNote} =====${C.reset}\n`,
    );

    const row = (s: string, step: string, detail: string) =>
      `  ${s.padEnd(7)}  ${step.padEnd(40)}  ${detail}\n`;
    process.stdout.write(row('STATUS', 'STEP', 'DETAIL'));
    process.stdout.write(row('------', '----', '------'));

    for (const { status, step, detail } of this.entries) {
      const { color, label } = (
        {
          ok: { color: C.green, label: 'OK' },
          fail: { color: C.red, label: 'FAIL' },
          skip: { color: C.yellow, label: 'SKIP' },
          info: { color: C.cyan, label: 'INFO' },
        } as const
      )[status];
      process.stdout.write(
        `  ${color}${label.padEnd(7)}${C.reset}  ${step.padEnd(40)}  ${detail}\n`,
      );
    }

    process.stdout.write('\n');
    if (this.hasFail) {
      process.stdout.write(
        `${C.bold}${C.red}Result: FAILURE${C.reset} — one or more steps failed\n\n`,
      );
      return false;
    }
    process.stdout.write(`${C.bold}${C.green}Result: SUCCESS${dryNote}${C.reset}\n\n`);
    return true;
  }
}

export const summary = new Summary();
