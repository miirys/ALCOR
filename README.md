# ✦ ALCOR

A refined, full-terminal UI for an agent harness — mock functionality only,
every pixel real. Named for Alcor (80 UMa), the faint companion of Mizar:
the ancient eyesight test.

Monochrome-leaning dark theme ("Alcor Night", `#0a0a0a` canvas) with a single
lavender accent carrying the identity, in the spirit of Grok Build's
GrokNight.

## Run

```sh
# node (>=20)
npm install
npm start

# bun
bun install
bun run start:bun
```

Needs a real TTY with true color + Unicode.

## What's inside

- **Splash** — shimmering ALCOR wordmark (starlight sweep), staged boot log,
  progress sweep. Any key skips.
- **Main menu** — resumable session list with live status dots, branch/turn/Δ
  metadata, actions.
- **Session** — the core screen:
  - streaming assistant text, thinking shimmer, animated tool cards
    (shell / read / edit / write / search / todos) with fold indicators
  - inline diffs with line numbers, tinted add/del rows, truncation + `ctrl+o`
  - nested subagent traces (`⑂ verify-tests`)
  - live context meter top-right (green→amber→red), turn-completion timings
  - sidebar (`ctrl+b`): changed-file tree with per-file diffstats, agent list
  - mode cycling `shift+tab`: NORMAL / PLAN / AUTO — input border recolors
  - command palette on `/` with fuzzy prefix filter and mock context costs
  - plan overlay: `[a]pprove · [c]omment · [q]uit` (plan kept in scrollback)
  - shortcuts overlay on `?`
  - `esc` interrupts a running turn, marking in-flight tools interrupted
- **Diff review** (`ctrl+d` or `/diff`) — file tree + patch pane,
  per-file approve/reject, `A` approves all.
- **Settings** (`ctrl+s` or `/settings`) — appearance (live theme swap with
  swatch strips), model, behavior, keys tabs.

## Themes

`Alcor Night` (default) · `Mizar` (ice) · `Phosphor` (green mono) ·
`Graphite` (true mono). Cycle live with `/theme`.

## Stack

Ink 5 + React 18, TypeScript, zero other runtime deps. Alternate screen
buffer for proper fullscreen; all animation driven by one frame hook
(shimmers, orbit/pulse/star spinners, typewriter streaming, meters).

Everything an agent appears to do here is scripted mock data
(`src/mock/data.ts`) — no model, no network, no file writes.
