import type { InstanceInfo } from '@gitlab-org/core';
import { NOT_AVAILABLE } from '../render_helpers';
import type { RuntimeContext } from '../../../runtime_context';

export function renderVersions(
  runtimeContext: RuntimeContext,
  instanceInfo: InstanceInfo | undefined,
): string {
  const { envInfo, cliVersion } = runtimeContext;
  const lines = [
    '## Versions',
    `- CLI: ${cliVersion}`,
    `- Node: ${process.version}`,
    `- OS: ${envInfo.osPlatform} ${envInfo.osVersion} (${process.arch})`,
    `- Distribution: ${envInfo.distribution}`,
    `- Terminal: ${envInfo.terminalName}`,
    `- Kitty protocol: ${envInfo.isKittyProtocolSupported ? 'enabled' : 'disabled'}`,
    `- GitLab instance: ${instanceInfo ? `${instanceInfo.instanceVersion} (${instanceInfo.instanceUrl.toString()})` : NOT_AVAILABLE}`,
  ];
  return lines.join('\n');
}
