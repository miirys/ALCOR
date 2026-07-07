import { spawn, type ChildProcess } from 'node:child_process';
import { rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const INTERCEPTOR_PROC = resolve(fileURLToPath(new URL('./interceptor_proc.mjs', import.meta.url)));

export interface InterceptorStartOptions {
  startupTimeoutMs?: number;
}

/**
 * Generate a test CA certificate without starting a proxy.
 *
 * Runs mockttp's CA generation in a subprocess (same Jest module-loader
 * workaround as NetworkInterceptor). Returns the path to the PEM file.
 * Call {@link cleanupCaCert} when the cert is no longer needed.
 */
export async function generateCaCert(options?: { timeoutMs?: number }): Promise<CaCert> {
  const timeoutMs = options?.timeoutMs ?? 15_000;
  const child = spawn(process.execPath, [INTERCEPTOR_PROC, '--cert-only'], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env },
  });

  const result = await new Promise<{ caCertPath: string; tmpDir: string }>(
    (resolvePromise, reject) => {
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error(`CA generation did not complete within ${timeoutMs}ms`));
      }, timeoutMs);

      let buf = '';
      let stderrBuf = '';
      const { stdout, stderr } = child;
      if (!stdout || !stderr) {
        clearTimeout(timer);
        reject(new Error('interceptor_proc --cert-only child had no stdout/stderr'));
        return;
      }
      stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8');
        const nl = buf.indexOf('\n');
        if (nl !== -1) {
          const line = buf.slice(0, nl);
          clearTimeout(timer);
          try {
            resolvePromise(JSON.parse(line) as { caCertPath: string; tmpDir: string });
          } catch {
            reject(new Error(`interceptor_proc --cert-only emitted non-JSON: ${line}`));
          }
        }
      });
      stderr.on('data', (chunk: Buffer) => {
        stderrBuf += chunk.toString('utf8');
      });
      child.on('exit', (code) => {
        if (!buf.includes('\n')) {
          clearTimeout(timer);
          reject(
            new Error(`interceptor_proc --cert-only exited (code ${code}). stderr:\n${stderrBuf}`),
          );
        }
      });
    },
  );

  return { certPath: result.caCertPath, tmpDir: result.tmpDir };
}

export interface CaCert {
  /** Path to the PEM-encoded CA certificate. */
  certPath: string;
  /** Temp directory containing the cert; pass to {@link cleanupCaCert}. */
  tmpDir: string;
}

/** Delete the temp directory created by {@link generateCaCert}. */
export function cleanupCaCert(cert: CaCert): void {
  try {
    rmSync(cert.tmpDir, { recursive: true, force: true });
  } catch {
    // best-effort
  }
}

/**
 * mockttp-based HTTPS/WebSocket interceptor. Runs in a subprocess to avoid
 * Jest's module loader limitations (mockttp's CJS build requires ESM-only
 * deps like get-port, which jest-runtime cannot load).
 *
 * Modes:
 *   - startAsMitmProxy(): HTTPS-intercepting proxy. Terminates CLI TLS using
 *     the test CA; re-establishes upstream TLS. Forwards WebSockets through.
 *   - startAsTlsTerminator(): alias for startAsMitmProxy. Point the CLI at
 *     this URL via --gitlab-base-url to act as a fake GitLab endpoint.
 *
 * Authenticated-proxy variants (PRX-3 / MITM-4) are deferred; mockttp does
 * not natively gate CONNECT on Proxy-Authorization. See network/README.md.
 */
export class NetworkInterceptor {
  #proc?: ChildProcess;

  #url = '';

  #caCertPath = '';

  get url(): string {
    if (!this.#url) throw new Error('interceptor not started');
    return this.#url;
  }

  get caCertPath(): string {
    if (!this.#caCertPath) throw new Error('interceptor not started');
    return this.#caCertPath;
  }

  get proxyUrl(): string {
    return this.url;
  }

  async #start(options: InterceptorStartOptions = {}): Promise<void> {
    const timeoutMs = options.startupTimeoutMs ?? 15_000;
    const child = spawn(process.execPath, [INTERCEPTOR_PROC], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env },
    });
    this.#proc = child;

    const { url, caCertPath } = await new Promise<{ url: string; caCertPath: string }>(
      (resolvePromise, reject) => {
        const timer = setTimeout(() => {
          reject(new Error(`interceptor did not start within ${timeoutMs}ms`));
        }, timeoutMs);

        let buf = '';
        let stderrBuf = '';
        const { stdout } = child;
        const { stderr } = child;
        if (!stdout || !stderr) {
          clearTimeout(timer);
          reject(new Error('interceptor child had no stdout/stderr'));
          return;
        }
        stdout.on('data', (chunk: Buffer) => {
          buf += chunk.toString('utf8');
          const nl = buf.indexOf('\n');
          if (nl !== -1) {
            const line = buf.slice(0, nl);
            clearTimeout(timer);
            try {
              const parsed = JSON.parse(line);
              resolvePromise(parsed as { url: string; caCertPath: string });
            } catch {
              reject(new Error(`interceptor emitted non-JSON: ${line}`));
            }
          }
        });
        stderr.on('data', (chunk: Buffer) => {
          stderrBuf += chunk.toString('utf8');
          // Surface startup errors immediately.
          if (stderrBuf.length > 2048 && !this.#url) {
            clearTimeout(timer);
            reject(new Error(`interceptor stderr: ${stderrBuf.slice(0, 2048)}`));
          }
        });
        child.on('exit', (code) => {
          if (!this.#url) {
            clearTimeout(timer);
            reject(
              new Error(`interceptor exited prematurely (code ${code}). stderr:\n${stderrBuf}`),
            );
          }
        });
      },
    );

    this.#url = url;
    this.#caCertPath = caCertPath;
  }

  async startAsMitmProxy(options: InterceptorStartOptions = {}): Promise<void> {
    await this.#start(options);
  }

  async startAsTlsTerminator(options: InterceptorStartOptions = {}): Promise<void> {
    await this.#start(options);
  }

  async stop(): Promise<void> {
    const proc = this.#proc;
    this.#proc = undefined;
    this.#url = '';
    this.#caCertPath = '';
    if (!proc) return;
    await new Promise<void>((r) => {
      proc.once('exit', () => r());
      proc.kill('SIGTERM');
      // Hard-kill fallback if it doesn't die within 2s.
      const killTimer = setTimeout(() => {
        if (!proc.killed) proc.kill('SIGKILL');
      }, 2000);
      killTimer.unref();
      proc.once('exit', () => clearTimeout(killTimer));
    });
  }
}
