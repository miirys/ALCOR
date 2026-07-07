import { ChildProcessWithoutNullStreams, spawn } from 'child_process';
import fs from 'fs';
import { readFile } from 'fs/promises';
import { platform } from 'os';
// @ts-expect-error - TODO: fix this
import tcpPortUsed from 'tcp-port-used';
import { Fetch } from '@gitlab-org/fetch/node';
import { log } from '../../common/log';
import { hasbinSync } from './hasbin';

const PROXY_PORT = 8888;
const PROXY = 'http://127.0.0.1:8888/';
const TINYPROXY = 'tinyproxy';
const TINYPROXY_CONF = '.tinyproxy.conf';
const TINYPROXY_LOG = 'tinyproxy.log';

const checkLogForRequest = async (s: string): Promise<boolean> => {
  const data = await readFile(TINYPROXY_LOG, 'utf8');
  return data.indexOf(`CONNECT ${s} HTTP/1.1`) >= 0;
};

async function startTinyProxy(): Promise<ChildProcessWithoutNullStreams> {
  const tinyProxy = spawn(TINYPROXY, ['-d', '-c', TINYPROXY_CONF]);

  if (tinyProxy == null) {
    throw new Error('Error, failed to start tinyproxy. tinyProxy == null.');
  }
  if (!tinyProxy?.pid) {
    throw new Error('Error, failed to start tinyproxy. pid undefined.');
  }

  try {
    // Wait for tinyproxy to startup
    await tcpPortUsed.waitUntilUsedOnHost(PROXY_PORT, '127.0.0.1');
  } catch (err) {
    console.error('Timed out checking for proxy port in use.');
    if (tinyProxy.exitCode) {
      console.error(`Tinyproxy exited with code ${tinyProxy.exitCode}. Logs:`);
    } else {
      console.warn('Tinyproxy still running. Logs:');
    }

    const data = await readFile(TINYPROXY_LOG, 'utf8');
    console.warn(data);

    throw err;
  }

  return tinyProxy;
}

const cleanupTinyProxy = async (tinyProxy: ChildProcessWithoutNullStreams): Promise<void> => {
  // Wait a little bit to make sure sockets are
  // cleaned up in node before we kill our proxy
  // instance. Otherwise we might get connection
  // reset exceptions from node.
  const delay = (ms: number) =>
    new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  await delay(500);

  // Try and stop tinyproxy nicely (SIGTERM)
  tinyProxy.kill();
  for (let cnt = 0; cnt < 5 && tinyProxy.exitCode == null; cnt++) {
    // eslint-disable-next-line no-await-in-loop
    await delay(100);
  }
  if (tinyProxy.exitCode == null) {
    // Kill the process if it didn't exit nicely
    tinyProxy.kill('SIGKILL');

    for (let cnt = 0; cnt < 5 && tinyProxy.exitCode == null; cnt++) {
      // eslint-disable-next-line no-await-in-loop
      await delay(100);
    }

    if (tinyProxy.exitCode == null) {
      throw new Error('Tinyproxy failed to exit properly.');
    }
  }

  if (fs.existsSync(TINYPROXY_LOG)) {
    fs.unlinkSync(TINYPROXY_LOG);
  }
};

const shouldUseTinyProxy = platform() !== 'win32' ? describe : describe.skip;
describe('LsFetch', () => {
  it('can make a get request', async () => {
    const lsFetch = new Fetch(log);
    await lsFetch.initialize();

    const resp = await lsFetch.get('https://gitlab.com/');
    expect(resp.status).toBe(200);
  });

  shouldUseTinyProxy('proxy Support', () => {
    it('tinyproxy is installed', () => {
      expect(hasbinSync(TINYPROXY)).toBeTruthy();
    });

    describe('when proxy is configured', () => {
      beforeEach(() => {
        if (fs.existsSync(TINYPROXY_LOG)) {
          fs.unlinkSync(TINYPROXY_LOG);
        }
        if (process.env.https_proxy) {
          delete process.env.https_proxy;
        }
        if (process.env.http_proxy) {
          delete process.env.http_proxy;
        }
      });

      afterEach(() => {
        if (fs.existsSync(TINYPROXY_LOG)) {
          fs.unlinkSync(TINYPROXY_LOG);
        }
        if (process.env.https_proxy) {
          delete process.env.https_proxy;
        }
        if (process.env.http_proxy) {
          delete process.env.http_proxy;
        }
      });

      describe('when proxy not running', () => {
        it('get should return connection error', async () => {
          process.env.https_proxy = PROXY;
          process.env.http_proxy = PROXY;

          const lsFetch = new Fetch(log);
          await lsFetch.initialize();

          try {
            await expect(() => lsFetch.get('https://gitlab.com/')).rejects.toHaveProperty(
              'message',
              'request to https://gitlab.com/ failed, reason: connect ECONNREFUSED 127.0.0.1:8888',
            );
          } finally {
            await lsFetch.destroy();
          }
        });
      });

      describe('when proxy is running', () => {
        let tinyProxy: ChildProcessWithoutNullStreams;
        jest.setTimeout(10 * 1000);

        beforeEach(async () => {
          tinyProxy = await startTinyProxy();
        });

        afterEach(async () => {
          await cleanupTinyProxy(tinyProxy);
        });

        it('request should happen through proxy', async () => {
          process.env.https_proxy = PROXY;
          process.env.http_proxy = PROXY;

          const lsFetch = new Fetch(log);
          await lsFetch.initialize();

          try {
            const resp = await lsFetch.get('https://gitlab.com/');
            await resp.text();
            expect(resp.status).toBe(200);
            expect(await checkLogForRequest('gitlab.com:443')).toBe(true);
          } finally {
            await lsFetch.destroy();
          }
        });
      });
    });
  });
});
