import { createInterfaceId, Injectable } from '@gitlab/needle';
import { LogContext, logCtxItem } from '@gitlab-org/logging';
import { getLanguageServerVersion, GitLabApiService, InstanceInfo } from '@gitlab-org/core';
import { ConfigService, ClientInfo, IdeInfo } from '@gitlab-org/config';

export interface SystemContext extends LogContext {
  ide?: IdeInfo;
  extension?: ClientInfo;
  lsVersion: string;
  instanceInfo?: InstanceInfo;
}

export const SystemContext = createInterfaceId<SystemContext>('SystemContext');

@Injectable(SystemContext, [ConfigService, GitLabApiService])
export class DefaultSystemContext implements SystemContext {
  #configService: ConfigService;

  #apiService: GitLabApiService;

  readonly lsVersion: string;

  constructor(configService: ConfigService, apiClient: GitLabApiService) {
    this.lsVersion = getLanguageServerVersion();
    this.#configService = configService;
    this.#apiService = apiClient;
  }

  get ide() {
    return this.#configService.get('telemetry.ide');
  }

  get extension() {
    return this.#configService.get('telemetry.extension');
  }

  get instanceInfo() {
    return this.#apiService.instanceInfo;
  }

  readonly name = 'Systems';

  get children() {
    const ideInfo = this.ide
      ? `${this.ide.vendor} - ${this.ide.name} (${this.ide.version})`
      : 'N/A';
    const extensionInfo = this.extension
      ? `${this.extension.name} (${this.extension?.version ?? 'N/A'})`
      : 'N/A';
    const instanceInfo = this.instanceInfo
      ? `${this.instanceInfo.instanceUrl} (version: ${this.instanceInfo.instanceVersion})`
      : 'not connected';
    return [
      logCtxItem('IDE', ideInfo),
      logCtxItem('Extension', extensionInfo),
      logCtxItem('Language Server version', this.lsVersion),
      logCtxItem('GitLab Instance', instanceInfo),
    ];
  }
}
