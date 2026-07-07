import { createInterfaceId } from '@gitlab/needle';
import { InstanceFeatureFlagsService } from './instance_feature_flags';

export enum ClientFeatureFlags {
  // Should match names found in https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/blob/main/src/common/feature_flags/constants.ts
  StreamCodeGenerations = 'streamCodeGenerations',
  DuoWorkflow = 'duoWorkflow',
  RemoteSecurityScans = 'remoteSecurityScans',
  EditFileDiagnosticsResponse = 'editFileDiagnosticsResponse',
}

export interface FeatureFlagService extends InstanceFeatureFlagsService {
  /**
   * Checks if a feature flag is enabled on the client.
   * @see `ConfigService` for client configuration.
   */
  isClientFlagEnabled(name: ClientFeatureFlags): boolean;
}

export const FeatureFlagService = createInterfaceId<FeatureFlagService>('FeatureFlagService');
