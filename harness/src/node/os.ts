import { platform, arch } from 'os';
import { Injectable } from '@gitlab/needle';
import { CurrentOs } from '@gitlab-org/legacy-common';

const platformMapping: Record<string, string> = {
  darwin: 'darwin',
  linux: 'linux',
  freebsd: 'freebsd',
  win32: 'windows',
};

const archMapping: Record<string, string> = {
  x64: 'amd64',
  arm: 'arm',
  ia32: '386',
  arm64: 'arm64',
  ppc64: 'ppc64le',
};

@Injectable(CurrentOs, [])
export class DesktopCurrentOs implements CurrentOs {
  name: string | null;

  constructor() {
    const osPlatform = platformMapping[platform()];
    const osArch = archMapping[arch()];

    this.name = osPlatform && osArch ? `${osPlatform}/${osArch}` : null;
  }
}
