import { DesktopWorkflowRunner, RunCommandAsProcess } from '@gitlab-org/workflow-executor/node';
import { DesktopWorkflowCommandService } from './desktop_workflow_command_service';
import { WorkflowRpcMessages } from './workflow_rpc_messages';
import { DefaultDesktopWorkflowUrlOpenerService } from './desktop_url_opener_service';

export const desktopWorkflowContributions = [
  DesktopWorkflowCommandService,
  RunCommandAsProcess,
  DefaultDesktopWorkflowUrlOpenerService,
  DesktopWorkflowRunner,
  WorkflowRpcMessages,
];
