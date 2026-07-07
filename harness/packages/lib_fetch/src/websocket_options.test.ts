import http from 'http';
import { mockBunRuntime } from '@gitlab-org/test-utils';
import { getDroppedOptionsWarnings, toIsomorphicWsOptions } from './websocket_options';

describe('toIsomorphicWsOptions', () => {
  const setBunRuntime = mockBunRuntime();

  describe('under Node.js runtime', () => {
    beforeEach(() => setBunRuntime(false));

    describe('with only an agent', () => {
      it('returns the agent in the flat option shape', () => {
        const agent = new http.Agent();

        const result = toIsomorphicWsOptions({ agent });

        expect(result).toEqual({ agent });
      });
    });

    describe('with agent + TLS material', () => {
      it('flattens TLS fields alongside the agent', () => {
        const agent = new http.Agent();
        const ca = Buffer.from('ca');
        const cert = Buffer.from('cert');
        const key = Buffer.from('key');

        const result = toIsomorphicWsOptions({
          agent,
          tls: { ca, cert, key, rejectUnauthorized: false },
        });

        expect(result).toEqual({
          agent,
          ca,
          cert,
          key,
          rejectUnauthorized: false,
        });
      });
    });

    describe('with proxyUrl populated', () => {
      it('ignores proxyUrl (Node uses agent, not proxy URL)', () => {
        const agent = new http.Agent();

        const result = toIsomorphicWsOptions({
          agent,
          proxyUrl: 'http://proxy.example.com:8080',
        });

        expect(result).toEqual({ agent });
        expect(result).not.toHaveProperty('proxy');
      });
    });

    describe('with empty input', () => {
      it('returns an empty object', () => {
        expect(toIsomorphicWsOptions({})).toEqual({});
      });
    });
  });

  describe('under Bun runtime', () => {
    beforeEach(() => setBunRuntime(true));

    describe('with proxyUrl', () => {
      it('uses Bun-style proxy option', () => {
        const result = toIsomorphicWsOptions({
          proxyUrl: 'http://proxy.example.com:8080',
        });

        expect(result).toEqual({ proxy: 'http://proxy.example.com:8080' });
      });
    });

    describe('with an HTTP proxy URL + agent', () => {
      it('prefers proxy URL (SRT-style http:// CONNECT proxy)', () => {
        const agent = new http.Agent();

        const result = toIsomorphicWsOptions({
          agent,
          proxyUrl: 'http://localhost:3128',
        });

        expect(result).toEqual({ proxy: 'http://localhost:3128' });
      });
    });

    describe('with an HTTPS proxy URL + agent', () => {
      it('prefers the Node agent (HTTPS MITM proxies need agent TLS trust)', () => {
        const agent = new http.Agent();

        const result = toIsomorphicWsOptions({
          agent,
          proxyUrl: 'https://localhost:8000',
        });

        expect(result).toEqual({ agent });
      });
    });

    describe('with only an HTTP proxy URL (no agent)', () => {
      it('uses the proxy URL', () => {
        const result = toIsomorphicWsOptions({
          proxyUrl: 'http://localhost:3128',
        });

        expect(result).toEqual({ proxy: 'http://localhost:3128' });
      });
    });

    describe('with only an HTTPS proxy URL (no agent)', () => {
      it('falls back to the HTTPS proxy URL (best-effort, may fail for MITM)', () => {
        const result = toIsomorphicWsOptions({
          proxyUrl: 'https://localhost:8000',
        });

        expect(result).toEqual({ proxy: 'https://localhost:8000' });
      });
    });

    describe('with only an agent (no proxyUrl)', () => {
      it('uses the agent for callers that did not resolve a proxy URL', () => {
        const agent = new http.Agent();

        const result = toIsomorphicWsOptions({ agent });

        expect(result).toEqual({ agent });
      });
    });

    describe('with TLS material (CA only)', () => {
      it('omits tls so Bun honours env-var trust stores like NODE_EXTRA_CA_CERTS', () => {
        const ca = Buffer.from('ca');

        const result = toIsomorphicWsOptions({
          tls: { ca, rejectUnauthorized: true },
        });

        expect(result).not.toHaveProperty('tls');
      });
    });

    describe('with mutual TLS material (cert + key)', () => {
      it('omits tls (Bun WebSocket does not support custom client cert)', () => {
        const cert = Buffer.from('cert');
        const key = Buffer.from('key');

        const result = toIsomorphicWsOptions({
          tls: { cert, key, rejectUnauthorized: true },
        });

        expect(result).not.toHaveProperty('tls');
      });
    });

    describe('with only `rejectUnauthorized: true` and no CA material', () => {
      it('omits the tls option so Bun honours env-var trust stores', () => {
        const result = toIsomorphicWsOptions({
          tls: { rejectUnauthorized: true },
        });

        expect(result).not.toHaveProperty('tls');
      });
    });

    describe('with `rejectUnauthorized: false`', () => {
      it('passes tls so verification is explicitly disabled', () => {
        const result = toIsomorphicWsOptions({
          tls: { rejectUnauthorized: false },
        });

        expect(result).toEqual({ tls: { rejectUnauthorized: false } });
      });
    });

    describe('with HTTP proxyUrl + `rejectUnauthorized: false`', () => {
      it('passes both proxy and tls so verification is disabled through the proxy', () => {
        const result = toIsomorphicWsOptions({
          proxyUrl: 'http://localhost:3128',
          tls: { rejectUnauthorized: false },
        });

        expect(result).toEqual({
          proxy: 'http://localhost:3128',
          tls: { rejectUnauthorized: false },
        });
      });
    });

    describe('with HTTPS proxyUrl + agent + `rejectUnauthorized: false`', () => {
      it('passes both agent and tls so verification is disabled through the agent', () => {
        const agent = new http.Agent();

        const result = toIsomorphicWsOptions({
          agent,
          proxyUrl: 'https://localhost:8000',
          tls: { rejectUnauthorized: false },
        });

        expect(result).toEqual({
          agent,
          tls: { rejectUnauthorized: false },
        });
      });
    });

    describe('with empty input', () => {
      it('returns an empty object', () => {
        expect(toIsomorphicWsOptions({})).toEqual({});
      });
    });
  });
});

describe('getDroppedOptionsWarnings', () => {
  const setBunRuntime = mockBunRuntime();

  describe('under Node.js runtime', () => {
    beforeEach(() => setBunRuntime(false));

    it('returns no warnings regardless of TLS material (everything is honoured)', () => {
      const ca = Buffer.from('ca');
      const cert = Buffer.from('cert');
      const key = Buffer.from('key');

      expect(getDroppedOptionsWarnings({ tls: { ca, cert, key } })).toEqual([]);
    });
  });

  describe('under Bun runtime', () => {
    beforeEach(() => setBunRuntime(true));

    it('returns no warnings when only proxyUrl and rejectUnauthorized are set', () => {
      expect(
        getDroppedOptionsWarnings({
          proxyUrl: 'http://localhost:3128',
          tls: { rejectUnauthorized: false },
        }),
      ).toEqual([]);
    });

    it('warns when a custom CA is configured', () => {
      const ca = Buffer.from('ca');

      const warnings = getDroppedOptionsWarnings({ tls: { ca } });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/NODE_EXTRA_CA_CERTS/);
    });

    it('warns when a client cert is configured (mTLS)', () => {
      const cert = Buffer.from('cert');
      const key = Buffer.from('key');

      const warnings = getDroppedOptionsWarnings({ tls: { cert, key } });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/mutual TLS/);
    });

    it('emits both warnings when CA + cert + key are all configured', () => {
      const ca = Buffer.from('ca');
      const cert = Buffer.from('cert');
      const key = Buffer.from('key');

      const warnings = getDroppedOptionsWarnings({ tls: { ca, cert, key } });

      expect(warnings).toHaveLength(2);
    });

    it('warns when an HTTPS proxy is used without a Node agent', () => {
      const warnings = getDroppedOptionsWarnings({ proxyUrl: 'https://localhost:8000' });

      expect(warnings).toHaveLength(1);
      expect(warnings[0]).toMatch(/HTTPS proxy/);
    });

    it('does not warn when an HTTPS proxy is paired with a Node agent', () => {
      const agent = new http.Agent();

      expect(getDroppedOptionsWarnings({ proxyUrl: 'https://localhost:8000', agent })).toEqual([]);
    });

    it('does not warn for an HTTP proxy without an agent', () => {
      expect(getDroppedOptionsWarnings({ proxyUrl: 'http://localhost:3128' })).toEqual([]);
    });
  });
});
