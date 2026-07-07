# Duo CLI beta consent

Duo CLI is a beta feature. Before starting a session, the CLI verifies that the customer has opted in to experimental and beta GitLab Duo features.

Related links:

- **Issue**: [#2148 — Duo CLI only works if admin enabled the Duo Beta/Experimental features](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/work_items/2148)
- **Epic**: [10 Beta Accounts for Duo CLI](https://gitlab.com/groups/gitlab-org/-/work_items/20881) (legal/consent thread)
- **Backend API fix**: [GitLab#594075](https://gitlab.com/gitlab-org/gitlab/-/issues/594075) — expose `experiment_features_enabled` in Groups API (targeting 18.11)
- **Backend MR**: [GitLab!228014](https://gitlab.com/gitlab-org/gitlab/-/merge_requests/228014) — API change to return the value
- **Client MR**: [GitLab LSP!3102](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/3102) — gate CLI startup on the group beta/experimental setting
- **Allowlist MR**: [GitLab LSP!3163](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/3163) — introduced the hashed instance allowlist
- **Admin setting docs**: [Turn on beta and experimental features](https://docs.gitlab.com/user/duo_agent_platform/turn_on_off/#turn-on-beta-and-experimental-features)

## The production consent check

During initialization (`CliInitializationService`), the CLI:

1. Detects the user's root namespace (from the Git remote, or the user's default Duo namespace)
1. Calls `GET /api/v4/groups/:namespace?with_projects=false` and checks `experiment_features_enabled`
1. If the field is `false` or missing, the CLI shows an error and exits

This relies on the API fix in [GitLab!228014](https://gitlab.com/gitlab-org/gitlab/-/merge_requests/228014), available from GitLab 18.11+.

## Instance allowlist

Instances on versions older than 18.11 don't expose `experiment_features_enabled`. To unblock these customers, the CLI maintains a hashed allowlist of instance URLs in `packages/cli/src/beta_instance_allowlist.ts`.

Allowlisted instances skip the beta features check entirely.

### Managing the allowlist

Use the helper script to add or remove instances:

```shell
./scripts/dev/beta-allowlist.mjs add https://example.gitlab.com
./scripts/dev/beta-allowlist.mjs remove https://example.gitlab.com
```

The script normalizes the URL and stores only the SHA-256 hash. Never commit plaintext instance URLs or customer names in commit messages.

### Example: adding a customer instance

```shell
# 1. Create a branch from main
git checkout -b tv/2026-04/beta-consent-3 main

# 2. Add the instance URL (provided by the customer or CSM)
./scripts/dev/beta-allowlist.mjs add https://customer.example.com

# 3. Commit — use a generic message, no customer names or URLs
git add packages/cli/src/beta_instance_allowlist.ts
git commit -m "chore: add customer consent for cli beta"

# 4. Push and create an MR
git push -o merge_request.create
```

For reference, see [!3163](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/3163) which introduced the allowlist.

### Removal

The allowlist is a temporary mechanism. It will be removed when the CLI reaches GA.
