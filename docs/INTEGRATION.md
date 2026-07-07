# Wiring ALCOR to a real backend

ALCOR is a pure UI. Everything that looks like an agent — turns, tool calls,
diffs, permissions, stats — is scripted mock data. This document is the map
for replacing the mock layer with a real backend whose behavior matches the
open-source **GitLab Duo CLI** (`glab duo cli` / the standalone `duo` binary),
plus whatever extra endpoints your fork adds.

The intent: an agent (or human) holding this doc and the backend source
should be able to wire the two together without reading the whole UI.

---

## 1. Where the seam is

Every mock lives in exactly two places:

| Location | What it fakes | Replace with |
| --- | --- | --- |
| `src/mock/data.ts` | Sessions, transcript events, diffs, models, MCP servers, skills, stats, slash commands, boot lines | Live queries against the backend |
| `src/screens/Session.tsx` → `runTurn` / `advance` / `resolvePerm` | The agent loop: a `setTimeout` stepper over `demoTurn()` | A subscription to the backend's event stream |

Nothing else knows the data is fake. Screens, theming, animations, and
layout all consume the types below and keep working untouched.

## 2. The contract the UI expects

Define one adapter object and hand it to the app (module import or React
context — either is fine; `Session.tsx` is the only heavy consumer).

```ts
// src/backend.ts — the only file a backend integration must implement.
import type { Event, SessionMeta, ModelInfo } from './mock/data.ts';

export interface AgentBackend {
  // ── Sessions (menu screen) ─────────────────────────────────────────────
  listSessions(): Promise<SessionMeta[]>;
  resumeSession(id: string): Promise<{ meta: SessionMeta; transcript: Event[] }>;
  newSession(cwd: string): Promise<SessionMeta>;

  // ── The agent loop (session screen) ────────────────────────────────────
  /**
   * Send a user turn. The UI renders each yielded event immediately.
   * Yield order and shapes are described in §3.
   */
  runTurn(sessionId: string, text: string, mode: 'normal' | 'plan' | 'auto'):
    AsyncIterable<Event>;

  /** Resolve a pending permission card. Mirrors glab duo's approval menu. */
  resolvePermission(eventId: string, verdict: 'allowed' | 'always' | 'rejected'): void;

  /** Esc pressed mid-turn. Backend should cancel and flush a final notice. */
  interrupt(sessionId: string): void;

  // ── Environment (overlays, settings, sidebar) ─────────────────────────
  listModels(): Promise<ModelInfo[]>;
  setModel(sessionId: string, modelId: string, effort: 'low' | 'medium' | 'high'): Promise<void>;
  mcpStatus(): Promise<{ name: string; state: 'ok' | 'down'; lat: string; tools: number }[]>;
  listSkills(): Promise<{ name: string; state: 'active' | 'idle' | 'disabled'; desc: string }[]>;
  stats(): Promise<typeof import('./mock/data.ts').stats>;
  contextUsage(sessionId: string): { used: number; max: number };
}
```

## 3. Event stream → UI rendering

`Event` (already defined in `src/mock/data.ts`) is the entire rendering
vocabulary. Map backend output onto it:

| UI event | Rendered as | Backend source (glab duo) |
| --- | --- | --- |
| `{type:'user'}` | Accent-barred user line | The prompt you just sent |
| `{type:'thinking'}` | Shimmering status line + star spinner | Status/progress messages before the first tool call |
| `{type:'tool', tool:'bash'\|'read'\|'search'\|…}` | Tool card with spinner → ✓/✗, foldable output | Tool-call start/finish events. Set `state:'running'` on start; re-emit or patch to `done`/`error` with `meta` (e.g. `exit 0`) |
| `{type:'tool', tool:'edit'\|'write'\|'rm', diff}` | Tool card with inline colored diff | File-change tools; convert the patch to `FileDiff` (see §4) |
| `{type:'tool', tool:'task', sub}` | Nested subagent trace | Duo flows / sub-workflows: put child lines in `sub.lines` |
| `{type:'tool', tool:'todo', todos}` | Checklist card | Plan/checklist state if the backend exposes it |
| `{type:'perm'}` | Permission card, **pauses the stream** | Duo's tool-approval prompt. See §5 |
| `{type:'assistant', stream:true}` | Typewriter-streamed prose (inline \`code\` highlighted) | Model response tokens; the UI streams display-side, so a single final string is fine |
| `{type:'turn-end'}` | `── Turn completed in … ──` rule | End-of-turn; include elapsed time + token count in `text` |
| `{type:'notice'}` | `◇` status line | Anything informational (resume, cancellation, errors) |

Implementation note: the mock stepper finalizes any still-`running` tool
cards when a non-tool event arrives (`advance()` in `Session.tsx`). Keep that
behavior — it is what makes interleaved output look tidy.

## 4. Diffs

`FileDiff` is a pre-chewed patch: `{path, status:'M'|'A'|'D', add, del, lines}`
where each line is `{kind:'ctx'|'add'|'del'|'hunk', old?, new?, text}`.
Write one converter from unified diff → `FileDiff` and use it for:

- `edit`/`write`/`rm` tool cards (transcript),
- the permission card preview,
- the sidebar file tree (`fileDiffs` today), and
- the full Diff Review screen (`src/screens/DiffReview.tsx`).

Diff Review's approve/reject verdicts are UI-local today; forward them to
the backend if your fork supports file-level apply/revert.

## 5. Permissions — mapping glab duo's approval menu

Duo CLI prompts with: *Approve* / *Approve for session (same arguments)* /
*Approve all uses of this tool for session* / *Deny*. ALCOR's card exposes
three keys, mapped as:

| ALCOR key | Verdict sent | glab duo equivalent |
| --- | --- | --- |
| `y` | `allowed` | Approve (single use) |
| `a` | `always` | Approve for session — pick the variant your fork prefers, or extend `PermEvent` with a fourth state for the wildcard option |
| `n` | `rejected` | Deny |

Emit `{type:'perm', action, diff?}` and **stop yielding** until
`resolvePermission()` is called — the UI pauses exactly this way today
(`pendingPerm` in `Session.tsx`). In AUTO mode (or headless
`duo_cli_auto_run`), skip emitting `perm` or emit it pre-resolved with
`state:'auto'` so the transcript still shows what was approved.

## 6. Modes

Shift+Tab cycles `NORMAL / PLAN / AUTO`. Map to Duo:

- **NORMAL** → Duo *Build* mode (read-write, prompts for approval).
- **PLAN** → Duo *Plan* mode (read-only). On completion, show the plan in
  the plan overlay; `[a]` approve should re-run in Build mode (the UI
  already does `runTurn('(Execute the approved plan)')` on approve).
- **AUTO** → Build with auto-approval (Duo headless behavior /
  `duo_cli_auto_run: true`).

## 7. Slash commands

`runCommand()` in `Session.tsx` is a flat switch — extend it there. Current
palette → backend mapping:

| ALCOR | glab duo | Notes |
| --- | --- | --- |
| `/sessions` | `/sessions` | Menu screen is the picker UI |
| `/model` | `/model` | Overlay adds a reasoning-effort control; if your fork lacks effort, drop the `←→` handler |
| `/mcp` | `/mcp` | Renders `mcpStatus()` as an in-chat card |
| `/settings` | `/settings` | Full-screen here instead of a panel |
| `/help` | `/help` | Shortcuts overlay |
| `/quit` | `/exit` | |
| `/plan`, `/diff`, `/compact`, `/imagine`, `/theme` | — | ALCOR extras; back with your fork's additions or leave UI-local |
| — | `/copy`, `/doctor`, `/feedback`, `/new`, `/skills` | Not yet in the palette; add entries to `slashCommands` in `data.ts` and a case in `runCommand()` |

## 8. Session lifecycle & hooks

- **Resume**: `resumeSession()` should replay the stored transcript as
  `Event[]` (Duo persists transcripts; the hook metadata exposes
  `transcript_path`). The UI renders whatever it's given — replayed tool
  cards arrive with `state:'done'`.
- **Boot lines**: the splash screen's staged checklist (`bootLines`) is the
  natural place to surface `SessionStart` hook output and MCP/skill
  discovery. Feed it real strings; keep them short (one line each).
- **Context meter**: poll `contextUsage()` per turn (or piggyback on
  `turn-end`) — the meter animates green→amber→red automatically.

## 9. What stays UI-only

Themes (`src/theme.ts`), all animations (`src/hooks.ts`, `src/ui.tsx`),
layout, keybindings, and the stats visualizations' rendering. The Stats tab
consumes the `stats` shape as-is — return real numbers and it just works.

## 10. Suggested integration order

1. `listSessions()` + menu screen (read-only, instantly demo-able).
2. `runTurn()` happy path: thinking → tools → assistant → turn-end.
3. Permission pause/resume (§5) — test all three verdicts and Esc.
4. Diff converter (§4), then the sidebar + Diff Review.
5. `/model`, `/mcp`, stats, skills.
6. Delete `src/mock/data.ts`'s `demoTurn` and the stepper; keep the types
   (move them to `src/types.ts` if you want the mock file fully gone).
