import { DefaultInitializeHandler } from './initialize_handler';
import { DefaultDidChangeWorkspaceFoldersHandler } from './did_change_workspace_folders_handler';
import { DefaultTelemetryNotificationHandler } from './telemetry_notification_handler';

export const connectionHandlersContributions = [
  DefaultInitializeHandler,
  DefaultDidChangeWorkspaceFoldersHandler,
  DefaultTelemetryNotificationHandler,
] as const;
