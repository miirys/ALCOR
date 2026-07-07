# Headless GitLab Duo CLI Testing

Test the GitLab Duo CLI `run` command in a CI-like Docker environment.

## Prerequisites

- [Bun](https://bun.sh/) available on your system
  - `mise install` from the Language Server repository will install `bun`
  - Alternatively it can be installed system-wide, see: <https://bun.com/docs/installation>
- GitLab auth token: `GITLAB_AUTH_TOKEN` or `GITLAB_API_PRIVATE_TOKEN`

## Local Testing (Quick Start)

```shell
cd packages/cli/scripts/test-headless-in-docker

bun -i ./run-in-docker.ts
```

The script will:

1. Build CLI binary for Linux x64 (`bin/duo-linux-x64`)
1. Fetch short-lived credentials from `/direct_access` API
1. Create workflow session
1. Generate `.env.generated`
1. Run workflow in Docker (binary mounted at `/binary/duo`)

## Configuration

By default, the workflow runs against the Language Server project.

With following env vars you can configure:

1. `GITLAB_BASE_URL` - target GitLab instance eg: `gdk.test:3000`
1. `DOCKER_IMG` - base Docker image to run DAP session inside

Edit `.env.template` to customize settings, also `flow_definition.json` and `additional_context.json`

## Testing against an older environment

1. Setup / get access to an older DAP test instance, e.g. these [dedicated test instances](https://gitlab.com/gitlab-com/gl-infra/gitlab-dedicated/sandbox/bmckitrick/dap-test-admin#using-it).
1. Setup a group/project if not yet done
1. Generate an API scope token for that instance
1. Update `.env.template`, e.g.

```env
GITLAB_BASE_URL=https://dap186.gitlab-private.org
GITLAB_PROJECT_PATH=test-dap-group/test-dap-project
GITLAB_PROJECT_CLONE_URL=https://dap186.gitlab-private.org/test-dap-group/test-dap-project.git
DUO_WORKFLOW_PROJECT_ID=2
DUO_WORKFLOW_NAMESPACE_ID=14
```

Now run the test script:

```shell
cd packages/cli/scripts/test-headless-in-docker

bun -i ./run-in-docker.ts
```

## CI Testing

The CI pipeline has a single manual job: `cli-headless-e2e-test`

It builds a Linux x64 CLI binary and executes `run-in-ci.ts`. This shares the same base setup steps.

The CI script spawns `duo run` (via the built binary path) in an isolated subprocess that does NOT have access to the full CI environment or GitLab API scoped token - only the values explicitly provided by the script.
