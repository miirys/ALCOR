import { platform, arch } from 'os';
import { DesktopCurrentOs } from './os';

jest.mock('os');

const platformArchCombinations = [
  { platform: 'darwin', arch: 'x64', expected: 'darwin/amd64' },
  { platform: 'linux', arch: 'arm', expected: 'linux/arm' },
  { platform: 'linux', arch: 'ppc64', expected: 'linux/ppc64le' },
  { platform: 'win32', arch: 'ia32', expected: 'windows/386' },
  { platform: 'freebsd', arch: 'arm64', expected: 'freebsd/arm64' },
  { platform: 'unsupported', arch: 'x64', expected: null },
  { platform: 'linux', arch: 'unsupported', expected: null },
  { platform: 'unsupported', arch: 'unsupported', expected: null },
];

describe('DesktopCurrentOs', () => {
  platformArchCombinations.forEach(({ platform: testPlatform, arch: testArch, expected }) => {
    it(`should return the correct name for ${testPlatform} ${testArch}`, () => {
      (platform as jest.Mock).mockReturnValue(testPlatform);
      (arch as jest.Mock).mockReturnValue(testArch);

      console.log(DesktopCurrentOs);

      const currentOs = new DesktopCurrentOs();
      expect(currentOs.name).toEqual(expected);
    });
  });
});
