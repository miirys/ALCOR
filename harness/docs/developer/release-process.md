# Release process

GitLab Language Server is released to multiple destinations, as there are many build targets (see [packaging](packaging.md)):

- The NPM package is uploaded to the project's package registry as an NPM package.
- Generated binaries are uploaded to the project's package registry as a generic package.
- The [NuGet package](nuget_packages.md) is uploaded to the project's package registry as a NuGet package.

## Cadence

GitLab Language Server releases are performed on Monday (UTC) of each week by the Release DRI. The weekly
cadence ensures that downstream projects are provided new features and bug fixes at a fast enough rate.

The Release DRI for a given date may be found by checking the
[milestone planning issue](https://gitlab.com/gitlab-org/editor-extensions/meta/-/issues/?sort=created_date&search=planning).
For example: [Editor Extensions 17.9 Planning](https://gitlab.com/gitlab-org/editor-extensions/meta/-/issues/197#language-server).

### Responsibilities of the Release DRI

1. Perform the weekly release on Monday (UTC) of each week.
   - If they cannot perform the release themselves, the DRI is responsible for delegating the task.
1. Update the Language Server section of the
   [milestone planning issue](https://gitlab.com/gitlab-org/editor-extensions/meta/-/issues/?sort=created_date&search=planning)
   with the DRI and release table. For an example, see
   [Editor Extensions 17.9 Planning](https://gitlab.com/gitlab-org/editor-extensions/meta/-/issues/197#language-server).
1. Before the next milestone begins, inform the next Release DRI.
   - [The rotation is available here](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/oncall_schedules) (to the Maintainer role only).
1. Pair with anyone who wants to shadow the release process.

### Ad-hoc releases

Ad-hoc releases are permitted:

- If you are a maintainer, follow the steps in [Perform release](#perform-release) below.
- Not a maintainer? Request an ad-hoc release in the `#f_language_server` Slack channel, or contact the Release DRI.

### Note community contributors

> [!warning]
> This step is manual. Ideally, community contribution attribution should be added as part of the original MR.

Before performing a release, check for community contributions:

1. Get emails of all contributors since the last release:

   ```shell
   git log --format='%ae' $(git describe --abbrev=0 --tags HEAD)..HEAD | sort -u
   ```

1. Look for emails that don't end with `@gitlab.com`.
1. For each community contribution, add attribution to `CHANGELOG.md` in the relevant entry. For example:

   ```plaintext
   (Implemented|Fixed|Refactored) by community contributor [@username](https://gitlab.com/username) with [MR !123](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/123) 🎉
   ```

1. Commit the changes:

   ```shell
   git add CHANGELOG.md && git commit -m "chore: add community contributor attribution"
   ```

1. Push and wait for the pipeline to pass before proceeding with the release.

## Perform release

Perform the following steps to release a new version of the extension.

1. In `#f_language_server`, announce the release is about to be published.
1. Open a [main branch pipeline](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/pipelines?page=1&scope=all&ref=main)
   on a commit you want to publish as a release. This commit must be after any previous release commits.
1. Locate the `publish-release::manual` job and start it.
   - The version update, tagging, and creating the GitLab release all happen automatically.
   - After the version bump is done, a release tag is pushed to the repository. This triggers `publish` and `release-nuget`.
1. If successful, Semantic Release will announce the release in `#f_language_server`.

## Release automation with Semantic Release

We use [semantic-release](https://github.com/semantic-release/semantic-release) plugin to automate the release process.

Semantic release offers plugins that allow us to automate various steps of the release process.

| Plugin                                                                                                     | Description                                                                                                                                                                          |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| [`@semantic-release/commit-analyzer`](https://github.com/semantic-release/commit-analyzer)                 | Analyzes commits since the last release to identify which version bump to apply (patch, minor or major).                                                                             |
| [`@semantic-release/release-notes-generator`](https://github.com/semantic-release/release-notes-generator) | Generates release notes based on the commit messages.                                                                                                                                |
| [`@semantic-release/npm`](https://github.com/semantic-release/npm)                                         | Writes the npm version. Can also be used to publish the package to an npm registry, but we rely on our own script.                                                                   |
| [`@semantic-release/git`](https://github.com/semantic-release/git)                                         | Commits file changes made during the release and pushes them to the repository.                                                                                                      |
| [`@semantic-release/gitlab`](https://github.com/semantic-release/gitlab)                                   | Creates a GitLab release and a Git tag associated with it. Uploads related release artifacts, such as the extension file, and generates comments to issues resolved by this release. |

## Manual release process (legacy)

> [!note]
> For the preferred process, see [Perform release](#perform-release).

Releases consist of deploying an NPM package and a corresponding generic package to
the [package registry](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/packages).

Prerequisites:

- You must be a project maintainer to perform a release.

To release a new version of the packages:

1. Fetch the latest tags with `git fetch --tags`.
1. Switch to the latest commit on the `main` branch.
1. Create a new branch `git checkout -b 2023-11-06-release`.
1. Determine whether it should be a `major/minor/patch` release, as defined by
   [Semantic Versioning](https://semver.org/) and [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/#summary).
   - If `git log --format='%B' $(git describe --abbrev=0 --tags HEAD)..HEAD | grep 'BREAKING CHANGE:\|!:'`
     returns anything, then it is likely to be a major version.
   - Otherwise, if `git log --format='%B' $(git describe --abbrev=0 --tags HEAD)..HEAD | grep 'feat.*:'`
     returns anything, it should be a minor version.
   - Otherwise, it should be a patch version.
1. Run `bun version major/minor/patch`.
   - This command creates a new version, updates the changelog, and tags the commit.
1. Push the branch and the tag. For example, if you created `v3.4.5`, run this command:

   ```shell
   git push && git push origin v3.4.5
   ```

1. Create a merge request from the `2023-11-06-release` branch:
   - Use the version number in the merge request name, like this: `Release LS version 3.4.5`.
   - Make sure the merge request **is not** set to squash, because squashing changes the release commit SHA.
1. No review is needed, as no code has changed.
1. Merge the `Release LS version 3.4.5` merge request.
1. Verify that the corresponding
   [tag pipeline](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/pipelines?scope=tags&page=1) succeeded.
