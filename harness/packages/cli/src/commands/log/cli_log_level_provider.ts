/* eslint-disable max-classes-per-file */
import { Injectable } from '@gitlab/needle';
import { LogLevel, LogLevelProvider } from '@gitlab-org/logging';
import { ParsedCliInput } from '../../parse';

export class DefaultLogLevelProvider implements LogLevelProvider {
  #logLevel: LogLevel;

  constructor(logLevel: LogLevel) {
    this.#logLevel = logLevel;
  }

  get logLevel() {
    return this.#logLevel;
  }
}

@Injectable(LogLevelProvider, [ParsedCliInput])
export class CliLogLevelProvider extends DefaultLogLevelProvider {
  constructor(cliInput: ParsedCliInput) {
    super(cliInput.logLevel);
  }
}
