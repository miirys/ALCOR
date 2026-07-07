---
name: skill-maintenance
description: Keep `.agents/skills/*/SKILL.md` files accurate. Apply at the end of any task that changed code, file layout, commands, or conventions a loaded skill describes — update the affected skill(s) so future sessions don't read stale guidance.
---

# Skill maintenance

Skills under `.agents/skills/<name>/SKILL.md` are read by future agent sessions to learn project conventions. When you change the code, file paths, commands, or conventions a skill describes, the skill must be updated in the same task — otherwise the next agent reads stale, confidently-wrong guidance.

This skill applies to **any task that touches the project**, not just skill-writing tasks. Treat the check below as a final step before declaring work done.

## Skills are long-term general guidance, not a session log

The single biggest failure mode of skill maintenance is **drift toward a changelog of the current task**. A skill is read cold by a future agent who has no knowledge of today's work. It must read like timeless reference documentation for the project as it exists now, not like notes from the session that last touched it.

When updating a skill, ask: _"Would this sentence make sense to an agent who has never heard of my current task?"_ If not, rewrite or drop it.

Concretely, **do not**:

- Mention that something was "recently", "now", or "as of <date>" changed — describe the current state plainly.
- Refer to the specific bug, feature, or ticket that motivated the change. The skill is not a postmortem.
- Add narrative like "we used to do X, then switched to Y". If X is gone, just document Y. (Exception: a single short note when future agents are genuinely likely to re-introduce X — keep it to one line.)
- Paste verbatim code or commands from the task that aren't actually a project-wide pattern — one-off invocations belong in commit messages, not skills.
- Expand the skill's scope to cover the niche your task happened to touch, if that niche isn't representative of the broader pattern.

Do:

- Prefer **deleting** stale content over layering corrections on top of it.
- Keep examples canonical and minimal — pick the clearest representative, not the one you just edited.
- Phrase guidance in the present tense, as project conventions ("Commands extend `DuoCommand`…"), not as task history ("We refactored commands to extend `DuoCommand`…").

If after your edits the skill reads like a diary of recent work rather than a stable reference, revise it until it doesn't.

## When to apply

Run the check whenever your task did at least one of:

- Renamed, moved, deleted, or split a file referenced (directly or by path/pattern) in any `SKILL.md`.
- Changed a public API, interface, or class name a skill names or shows in code samples.
- Changed a CLI command, npm script, env var, or shell incantation a skill prescribes.
- Changed a project convention (file naming, decorator usage, registration pattern, lint rule).
- Added a new pattern that supersedes one a skill currently describes as "the way".
- Removed a feature or pattern a skill still recommends.

If none of the above happened, skip this skill — there is nothing to update.

## Procedure

### 1. Enumerate skills that might be affected

```bash
ls .agents/skills/
```

For each skill that the current session **loaded** (read `SKILL.md` for) or whose `description` plausibly overlaps with what you changed, treat it as a candidate.

Don't audit every skill in the project on every task — only the ones whose scope intersects your changes. Use the frontmatter `description` of each skill to decide quickly.

### 2. Re-read the candidate skill in full

```text
read .agents/skills/<name>/SKILL.md
```

Look for stale content of these kinds:

- **File paths** that no longer exist or moved.
- **Code snippets** referencing renamed symbols, removed APIs, or outdated decorators.
- **Commands** (e.g. `bun run …`, script paths) that fail or are superseded.
- **"Use X" / "Don't use Y" guidance** that contradicts what you just made the new norm.
- **Examples** pointing at files that have been refactored — the file may still exist but no longer demonstrate the pattern.
- **The frontmatter `description`** — if your change broadens or narrows the skill's scope, the description must reflect that, because it's what triggers skill loading.

### 3. Decide: update, expand, or split

- **Update in place** when the skill's scope is unchanged and only specific facts (paths, names, commands, snippets) drifted.
- **Expand** when you added a new variant of the pattern the skill already covers (e.g. a new way to register something) — add a section, don't rewrite the whole file.
- **Split into a new skill** when your change introduces a sufficiently different concern that overloading the existing skill would dilute its description and hurt future skill-matching. New skill goes under `.agents/skills/<new-name>/SKILL.md` with its own frontmatter.
- **Delete** when the skill describes something that no longer exists. Confirm with the user before deleting.

### 4. Edit precisely

- Keep edits minimal. Don't restructure unrelated sections.
- Preserve the skill's voice and existing section ordering — these files are read like reference docs, and gratuitous churn makes diffs noisy.
- Update relative file paths to match the new layout.
- If the change is non-obvious, add a one-line note explaining why a previous pattern was replaced (so future agents don't re-introduce it).

### 5. Verify the description still matches

After editing the body, re-read the frontmatter `description`. Ask yourself: _"If a future agent's task summary mentioned this topic, would the description correctly invite them to read this skill — and not invite them when the topic is now out of scope?"_

If the answer is no, rewrite the description. The description is the most-read line of the skill — it's the only line every agent sees in the system prompt.

### 6. Don't fabricate, don't speculate

- Only document patterns that **exist in the code** after your changes.
- Don't preemptively document patterns you "plan to add" — that produces guidance the codebase doesn't support.
- If a skill section described a pattern you removed and you're not adding a replacement, delete the section rather than leaving a TODO.

## Examples of triggering changes

| Change you made                                                              | Skill(s) likely affected     | Action                                                                                                 |
| ---------------------------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------------ |
| Refactored `packages/cli/src/command_defs.ts` away into `DuoCommand` classes | `duo-cli-commands`           | Update or create the skill describing the new pattern.                                                 |
| Renamed `@Injectable` usages to `@Service` + `@Implements`                   | `di`                         | Confirm the legacy section is still accurate; update examples if rename touched files the skill cites. |
| Added a new `bun run test:something` script                                  | `testing`, `cli-development` | Add the script to the relevant Test Commands section.                                                  |
| Moved `verify.sh` to a new path                                              | `cli-development`, `testing` | Update every command snippet that references the old path.                                             |
| Removed an entire feature (e.g. dropped a backend)                           | All skills mentioning it     | Delete or rewrite affected sections; check `description` for accuracy.                                 |

## What this skill is **not**

- Not an excuse to audit and "improve" every skill on every task. Touch only what your changes invalidated.
- Not a license to add aspirational documentation. Skills describe what _is_, not what _should be_.
- Not a log of what the current session did. Skills are long-term, general guidance for future agents — keep them framed that way.
- Not a substitute for code review of the change itself — skill maintenance is a follow-up step after the underlying change is correct.

## Final checklist before ending the task

- [ ] Did I change anything a loaded or scope-overlapping skill describes?
- [ ] If yes, did I update each affected `SKILL.md`?
- [ ] Does each updated skill's `description` still accurately gate when it should be loaded?
- [ ] Are all file paths and code snippets in the updated skill resolvable in the current tree?
- [ ] Did I avoid touching skills my change didn't actually affect?
- [ ] Does the updated skill still read as timeless general guidance, with no traces of the current task's narrative?
