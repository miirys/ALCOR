# CI Docker Image (`ci-node`)

The `ci-node` image is a Debian-based Docker image with all project tools pre-installed via [mise](https://mise.jdx.dev/). It's the default image for all CI jobs and is also used by the Duo Developer agent.

- **Dockerfile**: `docker/ci-node/Dockerfile`
- **Tool versions**: `mise/config.toml` (single source of truth)
- **Registry**: `registry.gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/ci-node`

## Image tagging

The image is tagged with a content hash (first 16 hex chars of SHA-256) of `docker/ci-node/Dockerfile` and `mise/config.toml`. Same inputs produce the same tag, so the build is skipped when the image already exists in the registry.

The tag is referenced in two places:

- `CI_NODE_TAG` variable in `.gitlab-ci.yml` (used by the default image and `build-ci-node-image` job)
- `image:` field in `.gitlab/duo/agent-config.yml` (used by the Duo Developer agent)

A `verify-ci-node-tag` CI job hashes the two source files and fails if the result doesn't match `CI_NODE_TAG`.

## Updating tools

1. Edit `mise/config.toml` (or `docker/ci-node/Dockerfile`)
1. Commit — the lefthook pre-commit hook automatically updates `CI_NODE_TAG` in `.gitlab-ci.yml` and the image tag in `.gitlab/duo/agent-config.yml`
1. Push — the first pipeline builds and pushes the new image

**Expect the first pipeline to partially fail.** The `build-ci-node-image` job (stage: `build`) builds and pushes the new image, but all other jobs that use the default `ci-node` image start in parallel and fail because the image doesn't exist in the registry yet. Retry the failed jobs after `build-ci-node-image` succeeds, or push again to trigger a new pipeline where the image is already available.

If the lefthook hook didn't run (for example, lefthook isn't installed), the `verify-ci-node-tag` job catches the mismatch. Fix it with:

```shell
lefthook run pre-commit --force
```

## Testing locally

Build and test with Docker (or colima on macOS):

```shell
docker build -f docker/ci-node/Dockerfile -t ci-node-test .
docker run --rm ci-node-test sh -c 'node -v && tmux -V && asciinema --version'
```
