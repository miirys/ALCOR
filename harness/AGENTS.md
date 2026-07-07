# GitLab Language Server - Agent Instructions

This project contains a language server that powers GitLab Duo (AI) features like code completion, chat and agentic chat and flows.

## Code Standards

- Use `#` prefix to signal private methods/fields, never use `public` when defining classes
- It's OK to use `any` type when exploring, but remove it from final code. If necessary, leave a `// FIXME` comment
- When using `never`, make sure that you resolve the type as close as possible to its definition.
- Re-exports (`export { X } from './other_module'`) are only allowed in index files or temporarily during refactoring. Clients should import directly from the original module.

## Logging

- Use the `Logger` available through dependency injection if available, otherwise import `src/common/log.ts`
- **IMPORTANT**: the second argument to `info`, `warn`, `err`, and `debug` methods is for an error object only
- To log objects, use string template with `${JSON.stringify()}` in the **first** argument

## Verification After Implementation

IMPORTANT: After completing implementation work, verify it compiles and passes tests. Don't ask the user to paste errors — run the commands yourself and read the output.

- `./scripts/dev/fix-changed.sh` — lint/format only changed files

## Build & Install

- `mise exec -- bun install` to install dependencies
- `mise exec -- bun run build` to compile all packages
- `mise exec -- bun run compile` to type-check without emitting

Always use `mise` managed tooling to prevent version mismatch between repo and global installs.

## Commits

- Use conventional commits: `feat:`, `fix:`, `refactor:`, `chore:`, `test:`
- Scope to the area: `feat(cli):`, `fix(tui):`, `refactor(ls):`
