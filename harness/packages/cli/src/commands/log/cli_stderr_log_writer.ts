import { Injectable } from '@gitlab/needle';
import { LogWriter } from '@gitlab-org/logging';
import { truncateToByteLimit } from '@gitlab-org/core';

/**
 * Writes every log line to stderr, regardless of level.
 *
 * Used by headless `run --output-format json`, where stdout is reserved for the
 * single machine-readable result document. Routing logs to stderr (rather than
 * a side-channel file) follows the Unix convention of result-on-stdout /
 * diagnostics-on-stderr, so a consumer can capture or discard logs with a plain
 * `2>` redirect while keeping stdout a clean JSON stream.
 */
@Injectable(LogWriter, [])
export class CliStderrLogWriter implements LogWriter {
  write(msg: string): void {
    const truncatedMsg = truncateToByteLimit(msg, 16384, { suffix: '... (truncated)' });
    process.stderr.write(`${truncatedMsg}\n`);
  }
}
