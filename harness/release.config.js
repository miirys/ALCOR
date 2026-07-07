/* eslint-disable no-template-curly-in-string */
module.exports = {
  branches: 'main',
  plugins: [
    [
      '@semantic-release/commit-analyzer',
      {
        preset: 'conventionalcommits',
        releaseRules: [
          {
            type: 'refactor',
            release: 'patch',
          },
          {
            type: 'docs',
            scope: 'README',
            release: 'patch',
          },
          {
            type: 'test',
            release: 'patch',
          },
          {
            type: 'style',
            release: 'patch',
          },
          {
            type: 'perf',
            release: 'patch',
          },
          {
            type: 'ci',
            release: 'patch',
          },
          {
            type: 'build',
            release: 'patch',
          },
          {
            type: 'chore',
            release: 'patch',
          },
          {
            type: 'no-release',
            release: false,
          },
        ],
      },
    ],
    [
      '@semantic-release/release-notes-generator',
      {
        preset: 'conventionalcommits',
        writerOpts: {
          commitPartial:
            '* {{#if scope}}**{{scope}}:** {{/if}}{{subject}}{{#if hash}} ([{{shortHash}}]({{@root.host}}/{{@root.owner}}/{{@root.repository}}/commit/{{hash}})){{/if}}{{#if author.name}} by {{author.name}}{{/if}}\n',
        },
        presetConfig: {
          types: [
            {
              type: 'feat',
              section: '✨ Features',
              hidden: false,
            },
            {
              type: 'fix',
              section: '🐛 Bug Fixes',
              hidden: false,
            },
            {
              type: 'docs',
              section: '📝 Documentation',
              hidden: false,
            },
            {
              type: 'style',
              section: '💈 Code-style',
              hidden: false,
            },
            {
              type: 'refactor',
              section: '⚡ Refactor',
              hidden: false,
            },
            {
              type: 'perf',
              section: '⏩ Performance',
              hidden: false,
            },
            {
              type: 'test',
              section: '✅ Tests',
              hidden: false,
            },
            {
              type: 'ci',
              section: '🔁 CI',
              hidden: false,
            },
            {
              type: 'chore',
              section: '🔁 Chore',
              hidden: false,
            },
          ],
        },
      },
    ],
    [
      '@semantic-release/changelog',
      {
        changelogFile: 'CHANGELOG.md',
      },
    ],
    [
      '@semantic-release/npm',
      {
        npmPublish: false,
      },
    ],
    [
      '@semantic-release/exec',
      {
        prepareCmd: './scripts/semantic-release-prepare.sh',
      },
    ],
    [
      '@semantic-release/git',
      {
        assets: ['package.json', 'packages/cli/package.json', 'bun.lock', 'CHANGELOG.md'],
        message: 'chore(release): ${nextRelease.version} [skip ci]\n\n${nextRelease.notes}',
      },
    ],
    '@semantic-release/gitlab',
    [
      'semantic-release-slack-bot',
      {
        notifyOnSuccess: false,
        notifyOnFail: false,
        markdownReleaseNotes: true,
        slackWebhookEnVar: 'SLACK_WEBHOOK',
        branchesConfig: [
          {
            pattern: 'main',
            notifyOnSuccess: true,
            notifyOnFail: true,
          },
        ],
        onSuccessTemplate: {
          text: '🚀🚀🚀 New version of $package_name released: $npm_package_version 🚀🚀🚀 \n\n$release_notes',
        },
      },
    ],
  ],
};
