import { SandboxPlatform } from '@gitlab-org/core';

export function detectPlatform(): SandboxPlatform {
  switch (process.platform) {
    case 'darwin':
      return 'macos';
    case 'linux':
      return 'linux';
    case 'win32':
      return 'windows';
    default:
      return 'unsupported';
  }
}
