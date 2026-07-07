/** Mock data powering the UI. No real agent behind any of this. */

export interface SessionMeta {
  id: string;
  title: string;
  cwd: string;
  branch: string;
  model: string;
  when: string;
  turns: number;
  tokens: number; // used
  ctxMax: number;
  changed: number; // files changed
  status: 'idle' | 'running' | 'done';
}

export const sessions: SessionMeta[] = [
  {
    id: 's-01',
    title: 'refactor auth middleware to edge runtime',
    cwd: '~/dev/nebula-api',
    branch: 'feat/edge-auth',
    model: 'alcor-large-2',
    when: '2m ago',
    turns: 14,
    tokens: 91_400,
    ctxMax: 256_000,
    changed: 6,
    status: 'running',
  },
  {
    id: 's-02',
    title: 'fix flaky snapshot tests in renderer',
    cwd: '~/dev/aurora-ui',
    branch: 'fix/flaky-snap',
    model: 'alcor-large-2',
    when: '1h ago',
    turns: 8,
    tokens: 33_200,
    ctxMax: 256_000,
    changed: 3,
    status: 'idle',
  },
  {
    id: 's-03',
    title: 'add rate limiting to public endpoints',
    cwd: '~/dev/nebula-api',
    branch: 'feat/ratelimit',
    model: 'alcor-mini',
    when: 'yesterday',
    turns: 21,
    tokens: 128_900,
    ctxMax: 200_000,
    changed: 11,
    status: 'done',
  },
  {
    id: 's-04',
    title: 'migrate build pipeline to bun workspaces',
    cwd: '~/dev/monorepo',
    branch: 'chore/bun-migrate',
    model: 'alcor-large-2',
    when: '3d ago',
    turns: 32,
    tokens: 60_100,
    ctxMax: 256_000,
    changed: 24,
    status: 'done',
  },
];

// ── diffs ────────────────────────────────────────────────────────────────

export interface DiffLine {
  kind: 'ctx' | 'add' | 'del' | 'hunk';
  old?: number;
  new?: number;
  text: string;
}

export interface FileDiff {
  path: string;
  status: 'M' | 'A' | 'D';
  add: number;
  del: number;
  lines: DiffLine[];
}

export const fileDiffs: FileDiff[] = [
  {
    path: 'src/middleware/auth.ts',
    status: 'M',
    add: 18,
    del: 9,
    lines: [
      { kind: 'hunk', text: '@@ -12,9 +12,14 @@ import { verify } from "./jwt"' },
      { kind: 'ctx', old: 12, new: 12, text: 'export async function authenticate(req: Request) {' },
      { kind: 'del', old: 13, text: '  const token = req.headers.get("authorization");' },
      { kind: 'del', old: 14, text: '  if (!token) throw new AuthError("missing token");' },
      { kind: 'add', new: 13, text: '  const header = req.headers.get("authorization") ?? "";' },
      { kind: 'add', new: 14, text: '  const token = header.replace(/^Bearer\\s+/i, "");' },
      { kind: 'add', new: 15, text: '  if (!token) return unauthorized("missing bearer token");' },
      { kind: 'ctx', old: 15, new: 16, text: '' },
      { kind: 'del', old: 16, text: '  const claims = verify(token, SECRET);' },
      { kind: 'add', new: 17, text: '  const claims = await verifyEdge(token, env.JWT_KEY);' },
      { kind: 'add', new: 18, text: '  if (claims.exp * 1000 < Date.now()) {' },
      { kind: 'add', new: 19, text: '    return unauthorized("token expired");' },
      { kind: 'add', new: 20, text: '  }' },
      { kind: 'ctx', old: 17, new: 21, text: '  return claims;' },
      { kind: 'ctx', old: 18, new: 22, text: '}' },
    ],
  },
  {
    path: 'src/middleware/unauthorized.ts',
    status: 'A',
    add: 12,
    del: 0,
    lines: [
      { kind: 'hunk', text: '@@ -0,0 +1,12 @@' },
      { kind: 'add', new: 1, text: 'import { json } from "../http";' },
      { kind: 'add', new: 2, text: '' },
      { kind: 'add', new: 3, text: 'export function unauthorized(reason: string) {' },
      { kind: 'add', new: 4, text: '  return json(' },
      { kind: 'add', new: 5, text: '    { error: "unauthorized", reason },' },
      { kind: 'add', new: 6, text: '    { status: 401, headers: { "www-authenticate": "Bearer" } },' },
      { kind: 'add', new: 7, text: '  );' },
      { kind: 'add', new: 8, text: '}' },
    ],
  },
  {
    path: 'src/legacy/session.ts',
    status: 'D',
    add: 0,
    del: 41,
    lines: [
      { kind: 'hunk', text: '@@ -1,41 +0,0 @@' },
      { kind: 'del', old: 1, text: 'import cookie from "cookie";' },
      { kind: 'del', old: 2, text: '' },
      { kind: 'del', old: 3, text: '// legacy cookie sessions — replaced by edge JWT' },
      { kind: 'del', old: 4, text: 'export function readSession(req: Request) {' },
      { kind: 'del', old: 5, text: '  const jar = cookie.parse(req.headers.get("cookie") ?? "");' },
      { kind: 'del', old: 6, text: '  return jar["sid"] ?? null;' },
      { kind: 'del', old: 7, text: '}' },
    ],
  },
  {
    path: 'test/auth.test.ts',
    status: 'M',
    add: 22,
    del: 4,
    lines: [
      { kind: 'hunk', text: '@@ -30,4 +30,22 @@ describe("authenticate", () => {' },
      { kind: 'ctx', old: 30, new: 30, text: '  it("rejects missing token", async () => {' },
      { kind: 'del', old: 31, text: '    await expect(authenticate(req())).rejects.toThrow();' },
      { kind: 'add', new: 31, text: '    const res = await authenticate(req());' },
      { kind: 'add', new: 32, text: '    expect(res.status).toBe(401);' },
      { kind: 'add', new: 33, text: '  });' },
      { kind: 'add', new: 34, text: '' },
      { kind: 'add', new: 35, text: '  it("rejects expired token", async () => {' },
      { kind: 'add', new: 36, text: '    const res = await authenticate(req(expired));' },
      { kind: 'add', new: 37, text: '    expect(res.status).toBe(401);' },
      { kind: 'ctx', old: 32, new: 38, text: '  });' },
    ],
  },
];

// ── transcript events ────────────────────────────────────────────────────

export type ToolKind =
  | 'bash'
  | 'read'
  | 'edit'
  | 'write'
  | 'rm'
  | 'search'
  | 'task'
  | 'todo'
  | 'plan'
  | 'imagine'
  | 'compact'
  | 'mcp';

export interface ToolEvent {
  type: 'tool';
  id: string;
  tool: ToolKind;
  title: string; // e.g. command or file path
  detail?: string[]; // output lines / preview
  diff?: FileDiff;
  todos?: { text: string; state: 'done' | 'active' | 'todo' }[];
  sub?: { name: string; lines: string[] }; // subagent trace
  durationMs: number; // how long the spinner runs
  state: 'running' | 'done' | 'error';
  meta?: string; // e.g. "+18 -9" or "exit 0"
}

export interface TextEvent {
  type: 'user' | 'assistant' | 'thinking' | 'turn-end' | 'notice';
  id: string;
  text: string;
  stream?: boolean;
}

/** Permission card: the agent asks before acting. */
export interface PermEvent {
  type: 'perm';
  id: string;
  action: string; // e.g. "Edit src/middleware/auth.ts"
  kind: 'edit' | 'command'; // edits auto-approve in Build; commands still ask
  diff?: FileDiff;
  detail?: string; // one-line preview for commands
  state: 'ask' | 'allowed' | 'always' | 'rejected' | 'auto';
}

export type Event = ToolEvent | TextEvent | PermEvent;

let nextId = 0;
const id = () => `e${nextId++}`;

/** A scripted agent turn: each entry appears after `after` ms from turn start. */
export interface ScriptStep {
  after: number;
  event: Event;
}

export function demoTurn(userText: string): ScriptStep[] {
  nextId += 100;
  return [
    { after: 0, event: { type: 'user', id: id(), text: userText } },
    {
      after: 350,
      event: { type: 'thinking', id: id(), text: 'Scanning middleware and auth call-sites…' },
    },
    {
      after: 1600,
      event: {
        type: 'tool',
        id: id(),
        tool: 'search',
        title: 'grep "authenticate(" src/ — 7 matches in 4 files',
        detail: [
          'src/middleware/auth.ts:12',
          'src/routes/user.ts:8',
          'src/routes/admin.ts:15',
          'test/auth.test.ts:30',
        ],
        durationMs: 900,
        state: 'running',
      },
    },
    {
      after: 2700,
      event: {
        type: 'tool',
        id: id(),
        tool: 'read',
        title: 'src/middleware/auth.ts',
        detail: ['96 lines · ts · read in 0.1s'],
        durationMs: 700,
        state: 'running',
      },
    },
    {
      after: 3600,
      event: {
        type: 'tool',
        id: id(),
        tool: 'todo',
        title: 'Plan of record',
        todos: [
          { text: 'Replace sync jwt verify with edge-safe verifyEdge()', state: 'active' },
          { text: 'Add unauthorized() helper with RFC6750 header', state: 'todo' },
          { text: 'Delete legacy cookie sessions', state: 'todo' },
          { text: 'Update tests for 401 responses', state: 'todo' },
        ],
        durationMs: 400,
        state: 'running',
      },
    },
    {
      after: 4400,
      event: {
        type: 'perm',
        id: id(),
        action: 'Edit src/middleware/auth.ts',
        kind: 'edit',
        diff: fileDiffs[0],
        state: 'ask',
      },
    },
    {
      after: 4700,
      event: {
        type: 'tool',
        id: id(),
        tool: 'edit',
        title: 'src/middleware/auth.ts',
        diff: fileDiffs[0],
        durationMs: 1200,
        state: 'running',
        meta: '+18 −9',
      },
    },
    {
      after: 6000,
      event: {
        type: 'tool',
        id: id(),
        tool: 'write',
        title: 'src/middleware/unauthorized.ts',
        diff: fileDiffs[1],
        durationMs: 800,
        state: 'running',
        meta: '+12 −0',
      },
    },
    {
      after: 6800,
      event: {
        type: 'tool',
        id: id(),
        tool: 'rm',
        title: 'src/legacy/session.ts',
        diff: fileDiffs[2],
        durationMs: 500,
        state: 'running',
        meta: '−41 · legacy cookie sessions',
      },
    },
    {
      after: 7200,
      event: {
        type: 'tool',
        id: id(),
        tool: 'task',
        title: 'subagent: verify-tests',
        sub: {
          name: 'verify-tests',
          lines: [
            'bun test test/auth.test.ts',
            '✓ rejects missing token (4ms)',
            '✓ rejects expired token (3ms)',
            '✓ accepts valid bearer (6ms)',
            '3 pass, 0 fail — 41ms',
          ],
        },
        durationMs: 2600,
        state: 'running',
      },
    },
    {
      after: 7800,
      event: {
        type: 'perm',
        id: id(),
        action: 'Run shell command',
        kind: 'command',
        detail: 'bun run typecheck',
        state: 'ask',
      },
    },
    {
      after: 8100,
      event: {
        type: 'tool',
        id: id(),
        tool: 'bash',
        title: 'bun run typecheck',
        detail: ['$ tsc --noEmit', '0 errors · 1.9s'],
        durationMs: 1900,
        state: 'running',
        meta: 'exit 0',
      },
    },
    {
      after: 10600,
      event: {
        type: 'assistant',
        id: id(),
        text:
          'Migrated auth to the edge runtime. `authenticate()` now parses the Bearer header defensively, verifies with `verifyEdge()` against `env.JWT_KEY`, and returns structured 401s instead of throwing. Legacy cookie sessions are gone and the new `unauthorized()` helper sets `www-authenticate` per RFC 6750. Typecheck is clean and all 3 auth tests pass.',
        stream: true,
      },
    },
    { after: 13400, event: { type: 'turn-end', id: id(), text: '12.8s · 41.2k tokens' } },
  ];
}

export const planMarkdown = [
  '## Edge auth migration — plan',
  '',
  '1. **Swap verifier** — replace `verify()` (node crypto) with',
  '   `verifyEdge()` built on WebCrypto; key from `env.JWT_KEY`.',
  '2. **Structured failures** — never throw across the middleware',
  '   boundary; return 401 JSON with `www-authenticate: Bearer`.',
  '3. **Delete legacy** — remove cookie sessions (`src/legacy/session.ts`),',
  '   no call-sites remain after step 1.',
  '4. **Tests** — rewrite throw-based assertions to status assertions;',
  '   add expired-token case.',
  '',
  '_Est. 4 files · ~40 lines · low risk_',
];

export const shortcuts: [string, string][] = [
  ['Enter', 'Send message'],
  ['Shift+Tab', 'Cycle mode — Build / Plan / Auto'],
  ['/', 'Command palette'],
  ['Ctrl+B', 'Toggle sidebar'],
  ['Ctrl+D', 'Review diffs'],
  ['Ctrl+O', 'Expand / collapse tool output'],
  ['Ctrl+T', 'Toggle todos panel'],
  ['PgUp / PgDn', 'Scroll transcript'],
  ['Ctrl+L', 'Clear transcript'],
  ['Esc', 'Close overlay / back'],
  ['Ctrl+S', 'Settings'],
  ['?', 'This overlay (empty input)'],
  ['Ctrl+C', 'Quit ALCOR'],
];

export interface SlashCommand {
  cmd: string;
  desc: string;
  ctx?: string; // mock context cost
}

export const slashCommands: SlashCommand[] = [
  { cmd: '/plan', desc: 'Draft a plan before touching code', ctx: '~0.2%' },
  { cmd: '/diff', desc: 'Review pending changes', ctx: '~0.0%' },
  { cmd: '/model', desc: 'Switch model for this session', ctx: '~0.0%' },
  { cmd: '/settings', desc: 'Open settings', ctx: '~0.0%' },
  { cmd: '/sessions', desc: 'Back to the session picker', ctx: '~0.0%' },
  { cmd: '/compact', desc: 'Compact context, keep decisions', ctx: '−62%' },
  { cmd: '/imagine', desc: 'Generate an image from a prompt', ctx: '~0.01%' },
  { cmd: '/mcp', desc: 'MCP server status', ctx: '~0.1%' },
  { cmd: '/theme', desc: 'Pick a theme', ctx: '~0.0%' },
  { cmd: '/help', desc: 'Shortcuts & docs', ctx: '~0.3%' },
  { cmd: '/quit', desc: 'Exit ALCOR', ctx: '' },
];

// ── models (shared by settings + /model picker) ──────────────────────────

export interface ModelInfo {
  id: string;
  desc: string;
  badge: string;
}

export const models: ModelInfo[] = [
  { id: 'alcor-large-2', desc: 'flagship · 256k ctx · best for refactors', badge: 'default' },
  { id: 'alcor-large-2-fast', desc: 'same weights, faster decode', badge: '' },
  { id: 'alcor-mini', desc: 'cheap · 200k ctx · quick edits', badge: '' },
  { id: 'alcor-vision', desc: 'screenshots & UI verification', badge: 'beta' },
];

export const efforts = ['low', 'medium', 'high'] as const;

// ── /imagine mock render (star chart of UMa, block-art) ──────────────────

export const imagineArt = [
  '░░░░░░░░░░░░░░░░░░░░░░░░✦░░░░░░░░░░░░░░░░░░',
  '░░░░░✧░░░░░░░░░░░░░░░▒▒▒▒▒▒░░░░░░░░░✦░░░░░',
  '░░░░░░░░░░░★░░░░░░▒▒▓▓▓▓▓▓▒▒░░░░░░░░░░░░░░',
  '░░✦░░░░░░░╱░░░░░▒▓▓██ALCOR██▓▓▒░░░░░✧░░░░░',
  '░░░░░░░★╱░░░░░░▒▓██MIZAR████▓▒░░░░░░░░░░░░',
  '░░░░░╱░░░░░░░░░░▒▒▓▓▓▓▓▓▓▓▒▒░░░░✦░░░░░░░░░',
  '░★░░░░░░░✧░░░░░░░░░▒▒▒▒▒▒░░░░░░░░░░░░░░░░░',
  '░░░░░░░░░░░░░✦░░░░░░░░░░░░░░░░░░░✧░░░░░░░░',
];

export const mcpServers = [
  { name: 'github', state: 'ok', lat: '38ms', tools: 12 },
  { name: 'playwright', state: 'ok', lat: '4ms', tools: 7 },
  { name: 'memory', state: 'ok', lat: '1ms', tools: 3 },
  { name: 'postgres', state: 'down', lat: '—', tools: 0 },
] as const;

export const bootLines = [
  'Link established · alcor-large-2',
  'Workspace mounted · ~/dev/nebula-api',
  'Index warm · 1,284 files · 96ms',
  'MCP · github ✓  playwright ✓  memory ✓',
  'Skills · reviewer, verifier',
];

// ── stats (Settings → Stats tab) ─────────────────────────────────────────

export const stats = {
  totals: { sessions: 12, turns: 184, tokens: '4.6M', cost: '$23.40' },
  modelUsage: [
    { id: 'alcor-large-2', share: 0.62, tokens: '2.85M' },
    { id: 'alcor-large-2-fast', share: 0.21, tokens: '0.97M' },
    { id: 'alcor-mini', share: 0.14, tokens: '0.64M' },
    { id: 'alcor-vision', share: 0.03, tokens: '0.14M' },
  ],
  // tokens per day, last 14 days, normalized 0..1
  daily: [0.18, 0.32, 0.26, 0.55, 0.72, 0.4, 0.1, 0.48, 0.85, 1.0, 0.62, 0.3, 0.7, 0.9],
  dailyPeak: '612k',
  tools: [
    { name: 'Read', count: 402 },
    { name: 'Edit', count: 214 },
    { name: 'Shell', count: 178 },
    { name: 'Search', count: 167 },
    { name: 'Write', count: 71 },
    { name: 'Agent', count: 24 },
  ],
};

// ── skills (Settings → MCP & Skills tab) ─────────────────────────────────

export const skills = [
  { name: 'reviewer', state: 'active', desc: 'Reviews diffs before every commit' },
  { name: 'verifier', state: 'active', desc: 'Runs the project verify loop after edits' },
  { name: 'changelog-writer', state: 'idle', desc: 'Drafts changelog entries from merged work' },
  { name: 'release-notes', state: 'disabled', desc: 'Summarizes a milestone into notes' },
] as const;
