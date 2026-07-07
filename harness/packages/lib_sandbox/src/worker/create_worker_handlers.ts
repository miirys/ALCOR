import type { Logger } from '@gitlab-org/logging';
import { FsFileAccessService, DesktopFsClient } from '@gitlab-org/fs/node';
import { BM25CodeSnippetsRanker, NullRgBinaryProvider } from '@gitlab-org/workflow-executor';
import {
  RunCommandAsProcess,
  DefaultRipgrepService,
  RunCommandActionHandler,
  RunShellCommandActionHandler,
  EditFileActionHandler,
  WriteFileActionHandler,
  ReadFileActionHandler,
  ReadFilesActionHandler,
  FindFilesActionHandler,
  ListDirectoryActionHandler,
  MakeDirectoryActionHandler,
  GrepActionHandler,
  GitlabApiRequestActionHandler,
} from '@gitlab-org/workflow-executor/node';
import type { WorkflowActionHandler } from '@gitlab-org/workflow-executor/node';
import type { DocumentQualityService } from '@gitlab-org/document';
import type { FeatureFlagService, GitLabApiService } from '@gitlab-org/core';
import type { ConfigService } from '@gitlab-org/config';

/**
 * Creates all workflow action handlers with lightweight, worker-compatible dependencies.
 *
 * This is the manual equivalent of the DI-based handler registration in the CLI's `di.ts`.
 * The worker process runs inside a sandbox and does not have access to the full LS DI container.
 */
export function createWorkerHandlers(logger: Logger): WorkflowActionHandler[] {
  const fileAccessService = new FsFileAccessService();
  const fsClient = new DesktopFsClient();
  // get() returns the whole config (read_file reads workspaceFolders); get(key) stays undefined.
  const configServiceStub = {
    get: (key?: unknown) => (key ? undefined : { workspaceFolders: [] }),
  } as unknown as ConfigService;
  const commandService = new RunCommandAsProcess(logger, configServiceStub);
  const snippetRanker = new BM25CodeSnippetsRanker();
  const ripgrepService = new DefaultRipgrepService(logger, new NullRgBinaryProvider());

  // Stubs for services not available in the sandbox worker
  const docQualityStub = { getDiagnostics: async () => [] } as DocumentQualityService;

  const featureFlagStub = {
    isClientFlagEnabled: () => false,
    isInstanceFlagEnabled: () => false,
    updateInstanceFeatureFlags: () => Promise.resolve(),
  } as FeatureFlagService;

  const gitLabApiStub = {
    getSimpleClient: () => ({
      fetchFromApiRaw: () =>
        Promise.reject(new Error('GitLab API requests not available in sandbox worker')),
    }),
  } as unknown as GitLabApiService;

  return [
    new RunCommandActionHandler(logger, [commandService]),
    new RunShellCommandActionHandler(logger, [commandService]),
    new EditFileActionHandler(logger, [fileAccessService], docQualityStub, featureFlagStub),
    new WriteFileActionHandler(logger, [fileAccessService]),
    new ReadFileActionHandler(logger, [fileAccessService], fsClient, configServiceStub),
    new ReadFilesActionHandler(logger, [fileAccessService], fsClient, configServiceStub),
    new FindFilesActionHandler(logger, ripgrepService),
    new ListDirectoryActionHandler(logger, [fileAccessService]),
    new MakeDirectoryActionHandler(logger, [fileAccessService]),
    new GrepActionHandler(logger, [fileAccessService], snippetRanker, ripgrepService),
    new GitlabApiRequestActionHandler(logger, gitLabApiStub),
  ];
}
