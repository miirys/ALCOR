## Description

<!---
This MR needs to produce conventional commit(s) in the main branch.
Ensure one of the following:
- the MR title is a conventional commit message and the MR is set to squash
- the MR is not set to squash and all MR commits have valid conventional commit messages

Docs: https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/blob/main/docs/developer/commits.md#commit-conventions
-->

<!-- Describe what this MR does -->
<!-- Start with why this change is made -->
<!-- Then explain on a **high-level** how the feature is implemented -->
<!-- Mention any edge cases or decisions you made that weren't part of the plan -->
<!-- IMPORTANT: Mention a few key implementation concepts, don't describe every minute code change you made. -->

## Related Issues

<!--- This project only accepts merge requests related to open issues
If suggesting a new feature or change, please discuss it in an issue first
If fixing a bug, there should be an issue describing it with steps to reproduce -->

Issue #[issue_number]

## How has this been tested?

<!-- CRITICAL: focus on how to test e2e user-facing behaviour, don't mention unit tests unless there is something out of ordinary in them -->
<!-- IMPORTANT: never mention any information that CI verifies (no "the tests are passing" or "the linting has no errors") -->
<!--- Please describe in detail how you tested your changes. -->
<!--- Include details of your testing environment, and the tests you ran to -->
<!--- see how your change affects other areas of the code, etc. -->

_:warning: Does this MR include a GitLab Duo UI update? If so, please smoke test **all** webviews in a downstream project to ensure there are no visual regressions_

- One of:
   - [ ] GitLab for VS Code extension ([setup instructions](https://gitlab.com/gitlab-org/gitlab-vscode-extension/blob/main/docs/developer/language-server.md)).
   - [ ] GitLab JetBrains Plugin ([setup instructions](https://gitlab.com/gitlab-org/editor-extensions/gitlab-jetbrains-plugin/-/blob/main/docs/dev/language_server.md)).

### What CHANGELOG entry will this MR create?

<!--- What types of changes does your code introduce? Put an `x` in all the boxes that apply: -->

- [ ] `fix: ` Bug fix fixes - a user-facing issue in production - included in changelog
- [ ] `feature: ` New feature - a user-facing change which adds functionality - included in changelog
- [ ] `BREAKING CHANGE:` (fix or feature that would cause existing functionality to change) - should bump major version, mentioned in the changelog
- [ ] other non-user-facing changes

/label ~"devops::ai-powered" ~"group::editor extensions" ~"Category:Editor Extensions" ~"Editor Extensions::Language Server"
<!-- pick one of the following labels based on the issue you worked on -->
<!-- /label ~"type::feature" ~"type::bug" ~"type::maintenance" -->
/assign me
