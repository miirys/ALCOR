import { type Command, InvalidOptionArgumentError } from 'commander';
import { isGlab } from '@gitlab-org/tui';
import type { DuoCommand, Example, OptionGroup } from '../duo_command';
import type { BackendConfigAdapter } from '../../backend/backend_config_adapter';
import { initDi } from '../../di';
import { parse } from '../../parse';
import { runCommandOptionDefs } from '../../command_option_defs';
import { registerOptionsOnCommand } from '../../option_def';
import { getHeadlessEnvInfo } from '../../utils/environment';
import { CredentialProvider } from '../../utils/credential_provider';
import type { ExitHandler } from '../../utils/exit';
import { RunController } from './run_controller';

/**
 * Default examples for the GitLab-backend `run` invocation. Exported so the
 * root command tree can attach them to its run child without duplicating
 * the strings.
 */
export const gitlabRunExamples: Example[] = [
  {
    title: 'Run a one-shot workflow',
    exampleCommand: 'duo run --goal "Fix the failing tests in the auth module"',
  },
  {
    title: 'Run a workflow using a specific model',
    exampleCommand: 'duo run --goal "Refactor the payment service" --model claude_sonnet_4_6',
  },
  {
    title: 'Resume an existing session',
    exampleCommand: 'duo run --goal "Continue" --existing-session-id abc-123',
  },
  {
    title: 'Resume and approve the proposed plan',
    exampleCommand: 'duo run --goal "Continue" --existing-session-id abc-123 --approval true',
  },
  {
    title: 'Resume and reject the plan with feedback',
    exampleCommand:
      'duo run --goal "Continue" --existing-session-id abc-123 --approval false --rejection-reason "Too many files changed at once"',
  },
  {
    title: 'Run with a flow config file',
    exampleCommand: 'duo run --goal "Run the developer workflow" --flow-config ./my-flow.yaml',
  },
  {
    title: 'Run with inline flow config',
    exampleCommand:
      'duo run --goal "Run the developer workflow" --flow-config \'{"flowConfigId": "developer"}\'',
  },
];

export const gitlabRunSynopsis =
  'Requires `--goal` (or `DUO_WORKFLOW_GOAL`). ' +
  'Use `--existing-session-id` to resume a previous session. ' +
  'When resuming at a plan approval checkpoint, pass `--approval true|false|once` and optionally `--rejection-reason` to explain a rejection. ' +
  '`--flow-config` accepts either a YAML/JSON file path or inline YAML/JSON content.';

export interface RunCommandOptions<TBackendOpts> {
  adapter: BackendConfigAdapter<TBackendOpts>;
  version: string;
  exitHandler: ExitHandler;
  description?: string;
  /** Doc-only — examples for the auto-generated reference. */
  examples?: Example[];
  /** Doc-only — synopsis for the auto-generated reference. */
  synopsis?: string;
  /** Doc-only — option groups rendered for this command in the reference. */
  optionGroups?: OptionGroup[];
}

/**
 * Non-interactive workflow runner — `duo run` (or `duo direct run`).
 */
export class RunCommand<TBackendOpts> implements DuoCommand {
  readonly name = 'run';

  readonly description: string;

  readonly examples?: Example[];

  readonly synopsis?: string;

  readonly optionGroups?: OptionGroup[];

  readonly #adapter: BackendConfigAdapter<TBackendOpts>;

  readonly #version: string;

  readonly #exitHandler: ExitHandler;

  constructor(options: RunCommandOptions<TBackendOpts>) {
    this.#adapter = options.adapter;
    this.#version = options.version;
    this.#exitHandler = options.exitHandler;
    this.description = options.description ?? 'Run a workflow in non-interactive / headless mode.';
    this.examples = options.examples;
    this.synopsis = options.synopsis;
    this.optionGroups = options.optionGroups;
  }

  register(node: Command): void {
    registerOptionsOnCommand(node, runCommandOptionDefs);
    this.#adapter.registerOptions(node);

    node.action(async () => {
      const allOpts = node.optsWithGlobals();
      const parsed = parse(allOpts, 'run');
      const backendOpts = this.#adapter.parseOptions(allOpts);

      // stdout is reserved for the run's result (a JSON document in json mode, the
      // response text in text mode), so logs always go to stderr
      // (result-on-stdout / diagnostics-on-stderr).
      const logDestination = 'stderr';

      // `run` is headless: it never renders a live terminal UI, so it must not
      // probe terminal capabilities (those probes emit escape sequences that
      // would corrupt the output stream).
      const envInfo = await getHeadlessEnvInfo();

      const { container, configurationController } = await initDi(
        { logDestination },
        parsed,
        this.#version,
        envInfo,
        this.#exitHandler,
        this.#adapter,
        backendOpts,
      );

      // Try glab credential fallback before giving up.
      const credentialProvider = container.getRequiredService(CredentialProvider);
      const { token } = await credentialProvider.getCredentials();

      if (configurationController.isMissingConfiguration() && !token) {
        if (isGlab()) {
          throw new Error("No credentials found. Run 'glab auth login' to authenticate.");
        }
        throw new InvalidOptionArgumentError(
          '--gitlab-auth-token / GITLAB_AUTH_TOKEN option is required.',
        );
      }

      const controller = container.getRequiredService(RunController);
      await controller.initialize();
      await controller.execute();
    });
  }
}
