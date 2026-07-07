import { DefaultSandboxDisabledByUserCheck } from './sandbox_disabled_by_user_check';
import { DefaultSandboxUnsupportedPlatformCheck } from './sandbox_unsupported_platform_check';
import { DefaultSandboxMissingDependenciesCheck } from './sandbox_missing_dependencies_check';

export const sandboxFeatureStateContributions = [
  DefaultSandboxDisabledByUserCheck,
  DefaultSandboxUnsupportedPlatformCheck,
  DefaultSandboxMissingDependenciesCheck,
] as const;
