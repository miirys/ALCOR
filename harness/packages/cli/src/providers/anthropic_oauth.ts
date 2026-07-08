import { createServer, type Server } from 'node:http';
import { randomBytes, createHash } from 'node:crypto';
import type { StoredCredential } from './provider_registry';

/**
 * Anthropic subscription OAuth (Claude Pro/Max), authorization-code + PKCE.
 * Flow modeled on the open-source pi coding agent's implementation
 * (github.com/earendil-works/pi, MIT): a local callback server races a
 * manual code/URL paste, then the code is exchanged at the token endpoint.
 */

const CLIENT_ID = Buffer.from(
  'OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl',
  'base64',
).toString('utf8');
const AUTHORIZE_URL = 'https://claude.ai/oauth/authorize';
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token';
const CALLBACK_PORT = 53692;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
const SCOPES =
  'org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload';

const b64url = (buf: Buffer): string =>
  buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

interface PendingLogin {
  url: string;
  /** Resolve with the pasted code / redirect URL (manual path). */
  submitManualCode: (input: string) => void;
  cancel: () => void;
  /** Resolves with the stored credential once the flow completes. */
  credential: Promise<StoredCredential>;
}

function parseAuthorizationInput(input: string): { code?: string; state?: string } {
  const value = input.trim();
  if (!value) return {};
  try {
    const url = new URL(value);
    return {
      code: url.searchParams.get('code') ?? undefined,
      state: url.searchParams.get('state') ?? undefined,
    };
  } catch {
    // not a URL
  }
  if (value.includes('#')) {
    const [code, state] = value.split('#', 2);
    return { code, state };
  }
  if (value.includes('code=')) {
    const params = new URLSearchParams(value);
    return { code: params.get('code') ?? undefined, state: params.get('state') ?? undefined };
  }
  return { code: value };
}

async function exchangeCode(
  code: string,
  state: string,
  verifier: string,
): Promise<StoredCredential> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      client_id: CLIENT_ID,
      code,
      state,
      redirect_uri: REDIRECT_URI,
      code_verifier: verifier,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok)
    throw new Error(`Token exchange failed (${response.status}): ${body.slice(0, 200)}`);
  const data = JSON.parse(body) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    type: 'oauth',
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };
}

export async function refreshAnthropicToken(refreshToken: string): Promise<StoredCredential> {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'refresh_token',
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.text();
  if (!response.ok)
    throw new Error(`Token refresh failed (${response.status}): ${body.slice(0, 200)}`);
  const data = JSON.parse(body) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
  };
  return {
    type: 'oauth',
    access: data.access_token,
    refresh: data.refresh_token,
    expires: Date.now() + data.expires_in * 1000 - 5 * 60 * 1000,
  };
}

/**
 * Start the login flow: returns the authorize URL immediately and a promise
 * for the credential. The UI shows the URL, and may also submit a pasted
 * code/redirect URL (for remote/browserless machines) via submitManualCode.
 */
export function beginAnthropicLogin(): PendingLogin {
  const verifier = b64url(randomBytes(32));
  const challenge = b64url(createHash('sha256').update(verifier).digest());

  const params = new URLSearchParams({
    code: 'true',
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: challenge,
    code_challenge_method: 'S256',
    state: verifier,
  });
  const url = `${AUTHORIZE_URL}?${params.toString()}`;

  let server: Server | undefined;
  let submitManualCode: (input: string) => void = () => {};
  let cancel: () => void = () => {};

  const credential = new Promise<StoredCredential>((resolve, reject) => {
    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      try {
        server?.close();
      } catch {
        // already closed
      }
      fn();
    };

    const complete = (code: string, state: string) => {
      exchangeCode(code, state, verifier).then(
        (cred) => settle(() => resolve(cred)),
        (err: unknown) => settle(() => reject(err instanceof Error ? err : new Error(String(err)))),
      );
    };

    submitManualCode = (input: string) => {
      const parsed = parseAuthorizationInput(input);
      if (!parsed.code) {
        settle(() => reject(new Error('No authorization code found in the pasted input')));
        return;
      }
      complete(parsed.code, parsed.state ?? verifier);
    };

    cancel = () => settle(() => reject(new Error('Login cancelled')));

    try {
      server = createServer((req, res) => {
        const reqUrl = new URL(req.url ?? '', 'http://localhost');
        if (reqUrl.pathname !== '/callback') {
          res.writeHead(404).end('Not found');
          return;
        }
        const error = reqUrl.searchParams.get('error');
        const code = reqUrl.searchParams.get('code');
        const state = reqUrl.searchParams.get('state');
        if (error || !code || !state || state !== verifier) {
          res
            .writeHead(400, { 'Content-Type': 'text/html' })
            .end('<h3>ALCOR: login failed — return to the terminal.</h3>');
          return;
        }
        res
          .writeHead(200, { 'Content-Type': 'text/html' })
          .end('<h3>ALCOR: login complete — you can close this window.</h3>');
        complete(code, state);
      });
      server.on('error', () => {
        // Port taken or blocked — the manual paste path still works.
      });
      server.listen(CALLBACK_PORT, '127.0.0.1');
    } catch {
      // Callback server is best-effort; manual paste is the fallback.
    }
  });

  return { url, submitManualCode, cancel, credential };
}
