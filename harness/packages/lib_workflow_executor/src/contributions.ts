import { DefaultWorkflowConnection } from './api/workflow_connection';
import { DefaultWorkflowGraphqlOperations } from './api/workflow_graphql_operations';
import { DefaultWorkflowRailsService } from './api/workflow_rails_service';
import { DefaultWorkflowTokenService } from './api/workflow_token_service';
import { EditFileActionHandler } from './executors/node/actions/edit_file';
import { FindFilesActionHandler } from './executors/node/actions/find_files';
import { GitlabApiRequestActionHandler } from './executors/node/actions/gitlab_api_request';
import { GrepActionHandler } from './executors/node/actions/grep';
import { ListDirectoryActionHandler } from './executors/node/actions/list_directory';
import { MakeDirectoryActionHandler } from './executors/node/actions/mkdir';
import { ReadFileActionHandler } from './executors/node/actions/read_file';
import { ReadFilesActionHandler } from './executors/node/actions/read_files';
import { RunCommandActionHandler } from './executors/node/actions/run_command';
import { RunGitCommandActionHandler } from './executors/node/actions/run_git_command';
import { RunShellCommandActionHandler } from './executors/node/actions/run_shell_command';
import { RunMcpToolActionHandler } from './executors/node/actions/run_mcp_tool';
import { WriteFileActionHandler } from './executors/node/actions/write_file';
import { DefaultFileStateTracker } from './executors/node/actions/file_state_tracker';
import { DefaultNodeExecutor } from './executors/node/node_executor';
import { DefaultNodeExecutorWithRetry } from './executors/node/node_executor_with_retry';
import { BM25CodeSnippetsRanker } from './code_insights/ranking';
import { DefaultModelResolverService } from './model_resolver_service';
import { DefaultRipgrepService } from './services/ripgrep_service';

export const workflowExecutorContributions = [
  BM25CodeSnippetsRanker,
  DefaultModelResolverService,
  DefaultNodeExecutor,
  DefaultNodeExecutorWithRetry,
  DefaultWorkflowConnection,
  DefaultWorkflowGraphqlOperations,
  DefaultWorkflowRailsService,
  DefaultWorkflowTokenService,
  EditFileActionHandler,
  FindFilesActionHandler,
  GitlabApiRequestActionHandler,
  GrepActionHandler,
  ListDirectoryActionHandler,
  MakeDirectoryActionHandler,
  ReadFileActionHandler,
  ReadFilesActionHandler,
  RunCommandActionHandler,
  RunGitCommandActionHandler,
  RunMcpToolActionHandler,
  RunShellCommandActionHandler,
  WriteFileActionHandler,
  DefaultFileStateTracker,
  DefaultRipgrepService,
];
