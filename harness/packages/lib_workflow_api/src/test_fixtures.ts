/**
 * Real GitLab Duo CLI checkpoint fixtures.
 *
 * These are the `ui_chat_log` arrays from the FINAL checkpoint of two live Duo
 * CLI sessions, captured against the real backend. They power the unit tests
 * for `extractUiChatLog` (lib_workflow_api) and `WorkflowEventMapperService`
 * (cli) so those tests exercise the exact shape the backend emits.
 *
 * ## How these were captured (reproduce with the tui-testing skill)
 *
 * 1. Add a temporary capture line in
 *    `packages/cli/src/backend/gitlab/gitlab_backend.ts`, right after the
 *    `if (!isDuoWorkflowEvent(event)) continue;` guard inside the workflow
 *    event loop:
 *
 *        require('fs').appendFileSync(
 *          '/tmp/duo-checkpoint-capture.jsonl',
 *          `${event.checkpoint}\n`,
 *        );
 *
 *    Every checkpoint is appended as one JSON line; the LAST line holds the
 *    full `ui_chat_log` for the whole conversation.
 *
 * 2. Drive the CLI through the `tui_ctrl.ts` helper (see the tui-testing
 *    skill). Launch from the project root so the local build runs:
 *
 *        CTRL=packages/cli/test/e2e/tui_ctrl.ts
 *        # Standard flow:
 *        bun $CTRL launch -s cap-std --cwd "$PWD" -- bun run cli --skip-token-check
 *        # Developer flow (adds --developer):
 *        bun $CTRL launch -s cap-dev --cwd "$PWD" -- bun run cli --skip-token-check --developer
 *
 * 3. Send the SAME multi-step prompt to both sessions and approve each tool
 *    call (Enter selects "Approve") so the conversation includes real tool
 *    calls:
 *
 *        List the files in the current directory using a shell command, then
 *        read the package.json and tell me the project name and version.
 *        Finally count how many workspace packages there are.
 *
 * 4. After Duo finishes, the last line of `/tmp/duo-checkpoint-capture.jsonl`
 *    is the final checkpoint. Its `channel_values.ui_chat_log` array is what
 *    is inlined below.
 *
 * 5. Revert the temporary capture line.
 *
 * The standard flow (no flag) and the developer flow (`--developer`) produce
 * structurally different logs, so both are kept:
 *   - standard flow: `tool_response` is an OBJECT, requests carry
 *     `suggested_patterns`, and parallel tool calls batch two `request`
 *     entries before their `tool` results.
 *   - developer flow: `tool_response` is a plain STRING, messages carry extra
 *     `component_name`/`subsession_id` fields (stripped by the zod schema),
 *     and auto-approved tools appear as bare `tool` entries with no preceding
 *     `request`.
 *
 * NOTE: each user message's bulky `additional_context` blobs (AGENTS.md text,
 * skill listings) were truncated to ~80 chars. That field is typed
 * `z.unknown()` and is not read by the code under test, so truncation does not
 * affect behaviour.
 */

// Captured backend output - intentionally typed loosely so tests can feed the
// raw shape (including extra backend-only fields) through extractUiChatLog.
export const standardFlowUiChatLog: unknown[] = [
  {
    status: 'success',
    content:
      'List the files in the current directory using a shell command, then read the package.json and tell me the project name and version. Finally count how many workspace packages there are.',
    timestamp: '2026-06-12T11:56:56.525715+00:00',
    tool_info: null,
    message_id: 'user-bdaca6de-c6d1-4393-9e59-1d56e3b3b001',
    message_type: 'user',
    correlation_id: null,
    message_sub_type: null,
    additional_context: [
      {
        id: 'agents-md-user-instructions',
        category: 'user_rule',
        type: 'AdditionalContext',
        content:
          'The user wants you to adhere to these AGENTS.md rules:\n<instructions from="/User…[trimmed]',
        metadata: {
          icon: 'document',
          title: 'AGENTS.md',
          enabled: true,
          subType: 'user_rule',
          subTypeLabel: '2 AGENTS.md files included',
          secondaryText: '/Users/tomas/.gitlab/duo/AGENTS.md, AGENTS.md',
        },
      },
      {
        id: 'agent-skills-instructions',
        category: 'user_rule',
        type: 'AdditionalContext',
        content:
          'The following agent skills are available in this workspace. Load the skill file …[trimmed]',
        metadata: {
          icon: 'document',
          title: 'Agent Skills',
          enabled: true,
          subType: 'user_rule',
          subTypeLabel: '12 agent skills included',
          secondaryText:
            'cli-development, dead-code, di, duo-cli-commands, skill-maintenance, testing, tui-testing, workspace-packages, gitlab-api, gitlab-mr-comments, mr-review, test-greeting',
        },
      },
      {
        id: 'agent_user_environment_os_info',
        category: 'agent_user_environment',
        type: 'AdditionalContext',
        content: '{"platform":"darwin","architecture":"arm64"}',
        metadata: {
          icon: 'monitor',
          title: 'Operating System',
          enabled: true,
          subType: 'os',
          subTypeLabel: 'System Information',
          secondaryText: 'Platform: macOS • Architecture: arm64',
        },
      },
      {
        id: 'agent_user_environment_shell_info',
        category: 'agent_user_environment',
        type: 'AdditionalContext',
        content:
          '{"shell_name":"fish","shell_type":"unix","shell_environment":"native","ssh_sessi…[trimmed]',
        metadata: {
          icon: 'terminal',
          title: 'Shell Environment',
          enabled: true,
          subType: 'shell',
          subTypeLabel: 'System Terminal',
          secondaryText: 'Shell: fish',
        },
      },
    ],
  },
  {
    status: 'success',
    content: 'Tool run_command requires approval. Please confirm if you want to proceed.',
    timestamp: '2026-06-12T11:56:59.116923+00:00',
    tool_info: {
      args: {
        command: 'ls -la',
      },
      name: 'run_command',
    },
    message_id: 'request-toolu_01Go62XCuuepZYSG5vnyLPX5',
    message_type: 'request',
    correlation_id: null,
    message_sub_type: null,
    additional_context: null,
  },
  {
    status: 'success',
    content: 'Using run_command: command=ls -la',
    timestamp: '2026-06-12T12:00:03.753874+00:00',
    tool_info: {
      args: {
        command: 'ls -la',
      },
      name: 'run_command',
      tool_response: {
        content:
          'Exit code: 0\ntotal 2720\ndrwxr-xr-x@   54 tomas  staff    1728 Jun 12 13:52 .\ndrwxr-xr-x@   67 tomas  staff    2144 Jun 12 13:52 ..\ndrwxr-xr-x@    3 tomas  staff      96 Jun 12 13:52 .agents\n-rw-r--r--@    1 tomas  staff     147 Jun 12 13:52 .editorconfig\n-rw-r--r--@    1 tomas  staff      79 Jun 12 13:52 .git\n-rw-r--r--@    1 tomas  staff      41 Jun 12 13:52 .git-blame-ignore-revs\n-rw-r--r--@    1 tomas  staff     430 Jun 12 13:52 .gitignore\ndrwxr-xr-x@    7 tomas  staff     224 Jun 12 13:52 .gitlab\n-rw-r--r--@    1 tomas  staff   21872 Jun 12 13:52 .gitlab-ci.yml\ndrwxr-xr-x@    3 tomas  staff      96 Jun 12 13:52 .idea\n-rw-r--r--@    1 tomas  staff    3431 Jun 12 13:52 .markdownlint-cli2.yaml\n-rw-r--r--@    1 tomas  staff      52 Jun 12 13:52 .prettierignore\n-rw-r--r--@    1 tomas  staff      73 Jun 12 13:52 .prettierrc.json\n-rw-r--r--@    1 tomas  staff     125 Jun 12 13:52 .tinyproxy.conf\n-rw-r--r--@    1 tomas  staff     230 Jun 12 13:52 .vale.ini\ndrwxr-xr-x@    6 tomas  staff     192 Jun 12 13:52 .vscode\n-rw-r--r--@    1 tomas  staff    1592 Jun 12 13:52 AGENTS.md\n-rw-r--r--@    1 tomas  staff    3125 Jun 12 13:52 api-extractor.json\n-rw-r--r--@    1 tomas  staff     196 Jun 12 13:52 babel.config.js\n-rw-r--r--@    1 tomas  staff  809985 Jun 12 13:52 bun.lock\n-rw-r--r--@    1 tomas  staff      85 Jun 12 13:52 bunfig.toml\n-rw-r--r--@    1 tomas  staff  379208 Jun 12 13:52 CHANGELOG.md\ndrwxr-xr-x@    3 tomas  staff      96 Jun 12 13:52 config\n-rw-r--r--@    1 tomas  staff    2565 Jun 12 13:52 CONTRIBUTING.md\n-rw-r--r--@    1 tomas  staff     223 Jun 12 13:52 Dangerfile\ndrwxr-xr-x@    3 tomas  staff      96 Jun 12 13:52 docker\ndrwxr-xr-x@    8 tomas  staff     256 Jun 12 13:52 docs\n-rw-r--r--@    1 tomas  staff    9583 Jun 12 13:52 eslint.config.js\n-rw-r--r--@    1 tomas  staff     780 Jun 12 13:52 example.mise.local.toml\n-rw-r--r--@    1 tomas  staff     281 Jun 12 13:52 extended-gitleaks-config.toml\n-rw-r--r--@    1 tomas  staff    1033 Jun 12 13:52 jest.integration.config.ts\n-rw-r--r--@    1 tomas  staff    2240 Jun 12 13:52 jest.unit.config.ts\n-rw-r--r--@    1 tomas  staff    1716 Jun 12 13:52 knip.config.ts\n-rw-r--r--@    1 tomas  staff    1177 Jun 12 13:52 lefthook.yml\n-rw-r--r--@    1 tomas  staff    1076 Jun 12 13:52 LICENSE\n-rw-r--r--@    1 tomas  staff     274 Jun 12 13:52 macos-entitlements.xml\ndrwxr-xr-x@    3 tomas  staff      96 Jun 12 13:52 mise\ndrwxr-xr-x@ 1375 tomas  staff   44000 Jun 12 13:52 node_modules\n-rw-r--r--@    1 tomas  staff     437 Jun 12 13:52 nuget-spec-node-sea.nuspec\n-rw-r--r--@    1 tomas  staff     441 Jun 12 13:52 nuget-spec.nuspec\n-rw-r--r--@    1 tomas  staff    9823 Jun 12 13:52 package.json\ndrwxr-xr-x@   58 tomas  staff    1856 Jun 12 13:52 packages\n-rw-r--r--@    1 tomas  staff   19137 Jun 12 13:52 README.md\n-rw-r--r--@    1 tomas  staff    3740 Jun 12 13:52 release.config.js\ndrwxr-xr-x@   25 tomas  staff     800 Jun 12 13:52 scripts\nlrwxr-xr-x@    1 tomas  staff      14 Jun 12 13:52 skills -> .agents/skills\ndrwxr-xr-x@    6 tomas  staff     192 Jun 12 13:52 src\n-rw-r--r--@    1 tomas  staff    1250 Jun 12 13:52 THIRD_PARTY_LICENSES\n-rw-r--r--@    1 tomas  staff     643 Jun 12 13:52 tree-sitter.json\n-rw-r--r--@    1 tomas  staff     104 Jun 12 13:52 tsconfig.json\n-rw-r--r--@    1 tomas  staff     590 Jun 12 13:52 tsconfig.shared.json\n-rw-r--r--@    1 tomas  staff    1616 Jun 12 13:52 turbo.json\ndrwxr-xr-x@    4 tomas  staff     128 Jun 12 13:52 vendor\n-rw-r--r--@    1 tomas  staff     409 Jun 12 13:52 vitest.config.ts\n',
        additional_kwargs: {},
        response_metadata: {},
        type: 'ToolMessage',
        name: 'run_command',
        id: null,
        tool_call_id: 'toolu_01Go62XCuuepZYSG5vnyLPX5',
        artifact: null,
        status: 'success',
      },
    },
    message_id: 'toolu_01Go62XCuuepZYSG5vnyLPX5',
    message_type: 'tool',
    correlation_id: null,
    message_sub_type: 'command_output',
    additional_context: null,
  },
  {
    status: 'success',
    content: 'Tool run_command requires approval. Please confirm if you want to proceed.',
    timestamp: '2026-06-12T12:00:07.366209+00:00',
    tool_info: {
      args: {
        command: 'cat package.json | grep -E \'"name"|"version"\'',
      },
      name: 'run_command',
      suggested_patterns: ['cat package.json | grep -E *', 'cat package.json *'],
    },
    message_id: 'request-toolu_01K9ADNZZmrVwSD2M19rKBRG',
    message_type: 'request',
    correlation_id: null,
    message_sub_type: null,
    additional_context: null,
  },
  {
    status: 'success',
    content: 'Tool run_command requires approval. Please confirm if you want to proceed.',
    timestamp: '2026-06-12T12:00:07.543528+00:00',
    tool_info: {
      args: {
        command: 'ls packages/ | wc -l',
      },
      name: 'run_command',
      suggested_patterns: ['ls packages/ | wc *', 'ls packages/ *'],
    },
    message_id: 'request-toolu_01FvPreqgqJPF7g4j6CEQ39c',
    message_type: 'request',
    correlation_id: null,
    message_sub_type: null,
    additional_context: null,
  },
  {
    message_type: 'tool',
    message_sub_type: 'command_output',
    content: 'Using run_command: command=cat package.json | grep -E \'"name"|"version"\'',
    timestamp: '2026-06-12T12:00:13.712059+00:00',
    status: 'success',
    correlation_id: null,
    tool_info: {
      name: 'run_command',
      args: {
        command: 'cat package.json | grep -E \'"name"|"version"\'',
      },
      tool_response: {
        content:
          'Exit code: 0\n  "name": "@gitlab-org/gitlab-lsp",\n  "version": "8.104.0",\n    "version": "node scripts/set_ls_version.js",\n',
        additional_kwargs: {},
        response_metadata: {},
        type: 'ToolMessage',
        name: 'run_command',
        id: null,
        tool_call_id: 'toolu_01K9ADNZZmrVwSD2M19rKBRG',
        artifact: null,
        status: 'success',
      },
    },
    additional_context: null,
    message_id: 'toolu_01K9ADNZZmrVwSD2M19rKBRG',
  },
  {
    message_type: 'tool',
    message_sub_type: 'command_output',
    content: 'Using run_command: command=ls packages/ | wc -l',
    timestamp: '2026-06-12T12:00:13.865752+00:00',
    status: 'success',
    correlation_id: null,
    tool_info: {
      name: 'run_command',
      args: {
        command: 'ls packages/ | wc -l',
      },
      tool_response: {
        content: 'Exit code: 0\n      56\n',
        additional_kwargs: {},
        response_metadata: {},
        type: 'ToolMessage',
        name: 'run_command',
        id: null,
        tool_call_id: 'toolu_01FvPreqgqJPF7g4j6CEQ39c',
        artifact: null,
        status: 'success',
      },
    },
    additional_context: null,
    message_id: 'toolu_01FvPreqgqJPF7g4j6CEQ39c',
  },
  {
    message_type: 'agent',
    message_sub_type: null,
    content:
      "Here's the summary:\n\n- **Project name:** `@gitlab-org/gitlab-lsp`\n- **Version:** `8.104.0`\n- **Workspace packages:** **56** packages under the `packages/` directory",
    timestamp: '2026-06-12T12:00:15.925962+00:00',
    status: 'success',
    correlation_id: null,
    tool_info: null,
    additional_context: null,
    message_id: 'lc_run--019ebbb4-4440-7d72-a89d-a6e52ececc13',
  },
];

export const developerFlowUiChatLog: unknown[] = [
  {
    status: 'success',
    content:
      'List the files in the current directory using a shell command, then read the package.json and tell me the project name and version. Finally count how many workspace packages there are.',
    timestamp: '2026-06-12T12:00:47.219269+00:00',
    tool_info: null,
    message_id: 'tool-5095d24e-99bd-49da-a550-c0b401aea617',
    message_type: 'user',
    correlation_id: null,
    message_sub_type: null,
    additional_context: null,
  },
  {
    status: null,
    content: "I'll run these tasks in parallel where possible!",
    timestamp: '2026-06-12T12:00:50.614853+00:00',
    tool_info: null,
    message_id: 'agent-ed2ed76e-d108-4b8f-a74b-e923609ac091',
    message_type: 'agent',
    subsession_id: null,
    component_name: 'developer_agent',
    correlation_id: null,
    message_sub_type: 'reasoning',
    additional_context: [],
  },
  {
    status: 'success',
    content: 'Run shell command: ls -la',
    timestamp: '2026-06-12T12:00:50.621207+00:00',
    tool_info: {
      args: {
        command: 'ls -la',
      },
      name: 'run_command',
    },
    message_id: 'request-toolu_01YN31L3i1YV6ZVwuTwrW8Eu',
    message_type: 'request',
    correlation_id: null,
    message_sub_type: null,
    additional_context: null,
  },
  {
    message_type: 'tool',
    content:
      'Run shell command: ls -la Exit code: 0 total 2720 drwxr-xr-x@ 54 tomas staff 1728 Jun 12 13:52 . drwxr-xr-x@ 67 tomas [...]',
    timestamp: '2026-06-12T12:00:55.678878+00:00',
    status: 'success',
    correlation_id: null,
    tool_info: {
      name: 'run_command',
      args: {
        command: 'ls -la',
      },
      tool_response:
        'Exit code: 0\ntotal 2720\ndrwxr-xr-x@   54 tomas  staff    1728 Jun 12 13:52 .\ndrwxr-xr-x@   67 tomas  staff    2144 Jun 12 13:52 ..\ndrwxr-xr-x@    3 tomas  staff      96 Jun 12 13:52 .agents\n-rw-r--r--@    1 tomas  staff     147 Jun 12 13:52 .editorconfig\n-rw-r--r--@    1 tomas  staff      79 Jun 12 13:52 .git\n-rw-r--r--@    1 tomas  staff      41 Jun 12 13:52 .git-blame-ignore-revs\n-rw-r--r--@    1 tomas  staff     430 Jun 12 13:52 .gitignore\ndrwxr-xr-x@    7 tomas  staff     224 Jun 12 13:52 .gitlab\n-rw-r--r--@    1 tomas  staff   21872 Jun 12 13:52 .gitlab-ci.yml\ndrwxr-xr-x@    3 tomas  staff      96 Jun 12 13:52 .idea\n-rw-r--r--@    1 tomas  staff    3431 Jun 12 13:52 .markdownlint-cli2.yaml\n-rw-r--r--@    1 tomas  staff      52 Jun 12 13:52 .prettierignore\n-rw-r--r--@    1 tomas  staff      73 Jun 12 13:52 .prettierrc.json\n-rw-r--r--@    1 tomas  staff     125 Jun 12 13:52 .tinyproxy.conf\n-rw-r--r--@    1 tomas  staff     230 Jun 12 13:52 .vale.ini\ndrwxr-xr-x@    6 tomas  staff     192 Jun 12 13:52 .vscode\n-rw-r--r--@    1 tomas  staff    1592 Jun 12 13:52 AGENTS.md\n-rw-r--r--@    1 tomas  staff    3125 Jun 12 13:52 api-extractor.json\n-rw-r--r--@    1 tomas  staff     196 Jun 12 13:52 babel.config.js\n-rw-r--r--@    1 tomas  staff  809985 Jun 12 13:52 bun.lock\n-rw-r--r--@    1 tomas  staff      85 Jun 12 13:52 bunfig.toml\n-rw-r--r--@    1 tomas  staff  379208 Jun 12 13:52 CHANGELOG.md\ndrwxr-xr-x@    3 tomas  staff      96 Jun 12 13:52 config\n-rw-r--r--@    1 tomas  staff    2565 Jun 12 13:52 CONTRIBUTING.md\n-rw-r--r--@    1 tomas  staff     223 Jun 12 13:52 Dangerfile\ndrwxr-xr-x@    3 tomas  staff      96 Jun 12 13:52 docker\ndrwxr-xr-x@    8 tomas  staff     256 Jun 12 13:52 docs\n-rw-r--r--@    1 tomas  staff    9583 Jun 12 13:52 eslint.config.js\n-rw-r--r--@    1 tomas  staff     780 Jun 12 13:52 example.mise.local.toml\n-rw-r--r--@    1 tomas  staff     281 Jun 12 13:52 extended-gitleaks-config.toml\n-rw-r--r--@    1 tomas  staff    1033 Jun 12 13:52 jest.integration.config.ts\n-rw-r--r--@    1 tomas  staff    2240 Jun 12 13:52 jest.unit.config.ts\n-rw-r--r--@    1 tomas  staff    1716 Jun 12 13:52 knip.config.ts\n-rw-r--r--@    1 tomas  staff    1177 Jun 12 13:52 lefthook.yml\n-rw-r--r--@    1 tomas  staff    1076 Jun 12 13:52 LICENSE\n-rw-r--r--@    1 tomas  staff     274 Jun 12 13:52 macos-entitlements.xml\ndrwxr-xr-x@    3 tomas  staff      96 Jun 12 13:52 mise\ndrwxr-xr-x@ 1375 tomas  staff   44000 Jun 12 13:52 node_modules\n-rw-r--r--@    1 tomas  staff     437 Jun 12 13:52 nuget-spec-node-sea.nuspec\n-rw-r--r--@    1 tomas  staff     441 Jun 12 13:52 nuget-spec.nuspec\n-rw-r--r--@    1 tomas  staff    9823 Jun 12 13:52 package.json\ndrwxr-xr-x@   58 tomas  staff    1856 Jun 12 13:52 packages\n-rw-r--r--@    1 tomas  staff   19137 Jun 12 13:52 README.md\n-rw-r--r--@    1 tomas  staff    3740 Jun 12 13:52 release.config.js\ndrwxr-xr-x@   25 tomas  staff     800 Jun 12 13:52 scripts\nlrwxr-xr-x@    1 tomas  staff      14 Jun 12 13:52 skills -> .agents/skills\ndrwxr-xr-x@    6 tomas  staff     192 Jun 12 13:52 src\n-rw-r--r--@    1 tomas  staff    1250 Jun 12 13:52 THIRD_PARTY_LICENSES\n-rw-r--r--@    1 tomas  staff     643 Jun 12 13:52 tree-sitter.json\n-rw-r--r--@    1 tomas  staff     104 Jun 12 13:52 tsconfig.json\n-rw-r--r--@    1 tomas  staff     590 Jun 12 13:52 tsconfig.shared.json\n-rw-r--r--@    1 tomas  staff    1616 Jun 12 13:52 turbo.json\ndrwxr-xr-x@    4 tomas  staff     128 Jun 12 13:52 vendor\n-rw-r--r--@    1 tomas  staff     409 Jun 12 13:52 vitest.config.ts\n',
    },
    additional_context: [],
    message_sub_type: 'run_command',
    message_id: 'tool-74d2c617-c7b3-434a-b29e-33f4e1464508',
    component_name: 'developer_agent',
    subsession_id: null,
  },
  {
    message_type: 'tool',
    content: 'Read file',
    timestamp: '2026-06-12T12:00:55.929608+00:00',
    status: 'success',
    correlation_id: null,
    tool_info: {
      name: 'read_file',
      args: {
        file_path: 'package.json',
      },
      tool_response:
        '{\n  "name": "@gitlab-org/gitlab-lsp",\n  "description": "Language Server for GitLab",\n  "version": "8.104.0",\n  "author": "GitLab",\n  "license": "MIT",\n  "repository": {\n    "type": "git",\n    "url": "https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions.git"\n  },\n  "packageManager": "bun@1.2.23",\n  "main": "./out/common/index.js",\n  "bin": {\n    "gitlab-lsp": "./out/main-bundle-node.js"\n  },\n  "workspaces": [\n    "packages/*",\n    "src/common",\n    "src/node",\n    "src/browser"\n  ],\n  "typings": "./out/gitlab-lsp.d.ts",\n  "files": [\n    "vendor",\n    "out",\n    "docs",\n    "CHANGELOG.md",\n    "package.json"\n  ],\n  "dependencies": {\n    "@anthropic-ai/sandbox-runtime": "^0.0.53",\n    "@anycable/core": "^0.9.2",\n    "@asteasolutions/zod-to-openapi": "^7.3.4",\n    "@fastify/rate-limit": "^10.3.0",\n    "@gitlab/needle": "2.0.0",\n    "@sentry/esbuild-plugin": "^4.3.0",\n    "@types/chai": "^5.2.2",\n    "@vscode/ripgrep": "^1.17.1",\n    "chai": "^6.2.2",\n    "confbox": "^0.2.2",\n    "cross-fetch": "^4.1.0",\n    "fastify": "^5.6.1",\n    "fdir": "^6.4.6",\n    "get-proxy-settings": "^0.1.13",\n    "graphql": "^16.11.0",\n    "graphql-request": "^6.1.0",\n    "ini": "^4.1.3",\n    "isomorphic-ws": "^5.0.0",\n    "js-yaml": "^4.1.0",\n    "minimatch": "^10.0.3",\n    "proxy-agent": "^6.5.0",\n    "semver": "^7.7.3",\n    "simple-git": "^3.28.0",\n    "ssh-config": "5.0.4",\n    "typescript": "^5.8.3",\n    "uuid": "^10.0.0",\n    "vscode-jsonrpc": "^8.2.1",\n    "vscode-languageserver": "^9.0.1",\n    "vscode-languageserver-protocol": "^3.17.5",\n    "vscode-languageserver-textdocument": "^1.0.12",\n    "vscode-uri": "^3.1.0",\n    "web-tree-sitter": "^0.24.7",\n    "zod": "^4.4.1"\n  },\n  "overrides": {\n    "tree-sitter": "0.25.0",\n    "isomorphic-git": "1.32.3",\n    "@fastify/static": "8.2.0",\n    "@vue/compiler-core": "^3.5.32",\n    "@typescript-eslint/eslint-plugin": "^8.38.0",\n    "@typescript-eslint/parser": "^8.34.0"\n  },\n  "trustedDependencies": [],\n  "devDependencies": {\n    "@babel/core": "^7.26.9",\n    "@babel/plugin-proposal-decorators": "^7.28.0",\n    "@babel/preset-env": "^7.27.2",\n    "@babel/preset-typescript": "^7.27.1",\n    "@dotenvx/dotenvx": "^1.50.1",\n    "@gitlab/eslint-plugin": "^21.3.1",\n    "@vitest/eslint-plugin": "^1.3.4",\n    "@microsoft/api-extractor": "^7.52.3",\n    "@parcel/watcher": "^2.5.6",\n    "@rollup/plugin-babel": "^7.0.0",\n    "@semantic-release/changelog": "^6.0.3",\n    "@semantic-release/commit-analyzer": "^13.0.1",\n    "@semantic-release/exec": "^7.1.0",\n    "@semantic-release/git": "^10.0.1",\n    "@semantic-release/gitlab": "^13.2.7",\n    "@semantic-release/npm": "^12.0.2",\n    "@semantic-release/release-notes-generator": "^14.0.3",\n    "@sentry/cli": "^3.4.3",\n    "@types/cross-spawn": "^6.0.6",\n    "@types/fs-extra": "^11.0.4",\n    "@types/fuzzaldrin-plus": "^0.6.5",\n    "@types/ini": "^4.1.1",\n    "@types/jest": "^29.5.14",\n    "@types/js-yaml": "^4.0.9",\n    "@types/lodash": "^4.17.23",\n    "@types/node": "^22.14.30",\n    "@types/semver": "^7.7.1",\n    "@types/source-map-support": "^0.5.10",\n    "@types/uuid": "^10.0.0",\n    "@types/ws": "^8.18.1",\n    "@typescript-eslint/parser": "^8.34.0",\n    "async": "^3.2.6",\n    "babel-jest": "^29.7.0",\n    "buffer": "^6.0.3",\n    "chalk": "^5.6.2",\n    "commander": "^14.0.2",\n    "concurrently": "^8.2.2",\n    "conventional-changelog-conventionalcommits": "^8.0.0",\n    "dedent": "^1.6.0",\n    "esbuild": "^0.27.3",\n    "esbuild-node-externals": "^1.18.0",\n    "eslint": "^9.29.0",\n    "eslint-formatter-gitlab": "^6.0.1",\n    "eslint-import-resolver-typescript": "^4.4.4",\n    "eslint-plugin-import": "^2.32.0",\n    "eslint-plugin-vue": "~10.5.0",\n    "execa": "^9.3.1",\n    "fs-extra": "^11.3.2",\n    "http-server": "^14.1.1",\n    "jest": "^29.7.0",\n    "jest-junit": "^16.0.0",\n    "lefthook": "^1.7.15",\n    "mocha": "^11.7.2",\n    "mocha-headless-chrome": "^5.1.0",\n    "prettier": "3.6.1",\n    "rimraf": "^6.0.1",\n    "semantic-release": "^24.2.7",\n    "semantic-release-slack-bot": "^4.0.2",\n    "tcp-port-used": "^1.0.2",\n    "ts-node"',
    },
    additional_context: [],
    message_sub_type: 'read_file',
    message_id: 'tool-e5a42edc-2560-44c3-8f85-32292781885c',
    component_name: 'developer_agent',
    subsession_id: null,
  },
  {
    message_type: 'agent',
    content: 'Now let me count the workspace packages:',
    timestamp: '2026-06-12T12:00:58.135029+00:00',
    status: null,
    correlation_id: null,
    tool_info: null,
    additional_context: [],
    message_sub_type: 'reasoning',
    message_id: 'agent-8373dfc8-523b-467c-96ec-711ace1cafe7',
    component_name: 'developer_agent',
    subsession_id: null,
  },
  {
    message_type: 'tool',
    content: 'Using list_dir: directory=packages',
    timestamp: '2026-06-12T12:00:58.618006+00:00',
    status: 'success',
    correlation_id: null,
    tool_info: {
      name: 'list_dir',
      args: {
        directory: 'packages',
      },
      tool_response:
        'cli/\nduo_feature_access/\nfeature_state/\nlib_ai_configuration/\nlib_ai_configuration_webview/\nlib_ai_context/\nlib_config/\nlib_core/\nlib_disposable/\nlib_document/\nlib_documentation/\nlib_duo_agent_platform/\nlib_errors/\nlib_fetch/\nlib_flow_builder/\nlib_fs/\nlib_graphql/\nlib_handler_registry/\nlib_hooks/\nlib_knowledge_graph/\nlib_logging/\nlib_message_bus/\nlib_persistent_storage/\nlib_repositories/\nlib_request_context/\nlib_resiliency/\nlib_rpc/\nlib_rpc_client/\nlib_rpc_endpoint/\nlib_rpc_endpoint_lsp_adapter/\nlib_rpc_validation/\nlib_sandbox/\nlib_schema/\nlib_secret_redaction/\nlib_telemetry/\nlib_tool_approval/\nlib_vite_common_config/\nlib_webview/\nlib_webview_agentic_chat/\nlib_webview_client/\nlib_webview_gitlab_connection/\nlib_webview_plugin/\nlib_webview_theme/\nlib_webview_transport/\nlib_webview_transport_json_rpc/\nlib_webview_transport_socket_io/\nlib_workflow_api/\nlib_workflow_executor/\ntest_utils/\ntsdown.config.mts\ntui/\nwebview/\nwebview_agentic_tabs/\nwebview_duo_chat_classic/\nwebview_theming/\nwebview_vuln_details/',
    },
    additional_context: [],
    message_sub_type: 'list_dir',
    message_id: 'tool-fcdc077c-8979-410b-8f56-4b5ad3fed587',
    component_name: 'developer_agent',
    subsession_id: null,
  },
  {
    message_type: 'agent',
    content:
      "Here's a summary of everything:\n\n---\n\n## Directory Listing\nThe current directory contains 54 entries including config files, docs, scripts, source directories, and tooling configs (see `ls -la` output above).\n\n---\n\n## Project Info (`package.json`)\n\n| Field | Value |\n|---|---|\n| **Name** | `@gitlab-org/gitlab-lsp` |\n| **Version** | `8.104.0` |\n| **Description** | Language Server for GitLab |\n| **Package Manager** | `bun@1.2.23` |\n\n---\n\n## Workspace Packages\n\nThe `workspaces` field in `package.json` covers:\n- `packages/*` — **55 packages** in the `packages/` directory\n- `src/common`, `src/node`, `src/browser` — **3 additional source workspaces**\n\n**Total: 58 workspace packages**\n\nThe `packages/` directory alone contains 55 entries (including `cli`, `tui`, `webview`, numerous `lib_*` libraries, and a shared `tsdown.config.mts`). Adding the 3 `src/` workspaces gives **58 workspace members** in total.",
    timestamp: '2026-06-12T12:01:05.837652+00:00',
    status: 'success',
    correlation_id: null,
    tool_info: null,
    additional_context: [],
    message_sub_type: null,
    message_id: 'agent-a2a43f7d-20a5-4b68-ac7d-3a63805fc4b0',
    component_name: 'developer_agent',
    subsession_id: null,
  },
];

/** Wraps a raw ui_chat_log array into a LangGraph checkpoint JSON string. */
export function buildCheckpointFromUiChatLog(uiChatLog: unknown[]): string {
  return JSON.stringify({ channel_values: { ui_chat_log: uiChatLog } });
}
