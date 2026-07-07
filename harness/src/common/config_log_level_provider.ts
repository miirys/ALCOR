import { Injectable } from '@gitlab/needle';
import { ConfigService } from '@gitlab-org/config';
import { LOG_LEVEL, LogLevelProvider } from '@gitlab-org/logging';

@Injectable(LogLevelProvider, [ConfigService])
export class ConfigLogLevelProvider implements LogLevelProvider {
  #configService: ConfigService;

  constructor(configService: ConfigService) {
    this.#configService = configService;
  }

  get logLevel() {
    return this.#configService.get('logLevel') ?? LOG_LEVEL.INFO;
  }
}
