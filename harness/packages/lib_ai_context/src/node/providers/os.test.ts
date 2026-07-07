import { TestLogger } from '@gitlab-org/logging';
import type { AIContextItem } from '../../index';
import { DefaultOSContextProvider, OSInfo } from './os';

describe('OSContextProvider', () => {
  let provider: DefaultOSContextProvider;
  let logger: TestLogger;
  let originalPlatform: NodeJS.Platform;
  let originalArch: string;

  const expectOSResult = (
    result: AIContextItem[],
    expectedOSInfo: OSInfo,
    expectedSecondaryText: string,
  ) => {
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'agent_user_environment',
      id: 'agent_user_environment_os_info',
      content: JSON.stringify(expectedOSInfo),
      metadata: {
        title: 'Operating System',
        enabled: true,
        subType: 'os',
        icon: 'monitor',
        secondaryText: expectedSecondaryText,
        subTypeLabel: 'System Information',
      },
    });
  };

  beforeEach(() => {
    logger = new TestLogger();
    provider = new DefaultOSContextProvider(logger);
    originalPlatform = process.platform;
    originalArch = process.arch;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
  });

  it('detects OS information correctly', async () => {
    Object.defineProperty(process, 'platform', { value: 'linux' });
    Object.defineProperty(process, 'arch', { value: 'x64' });

    const result = await provider.getItems();

    expectOSResult(
      result,
      { platform: 'linux', architecture: 'x64' },
      'Platform: Linux • Architecture: x64',
    );
  });

  describe.each([
    ['win32', 'Windows'],
    ['darwin', 'macOS'],
    ['linux', 'Linux'],
    ['unknown-platform', 'unknown-platform'],
  ])('platform formatting', (platform, expectedFormat) => {
    it(`formats ${platform} as ${expectedFormat}`, async () => {
      Object.defineProperty(process, 'platform', { value: platform });
      Object.defineProperty(process, 'arch', { value: 'x64' });

      const result = await provider.getItems();

      expect(result[0].metadata.secondaryText).toContain(`Platform: ${expectedFormat}`);
    });
  });

  describe.each([
    [undefined, 'x64'],
    ['linux', undefined],
    [undefined, undefined],
  ] as const)('error handling', (platform, arch) => {
    it(`returns empty array when platform=${platform}, arch=${arch}`, async () => {
      Object.defineProperty(process, 'platform', { value: platform });
      Object.defineProperty(process, 'arch', { value: arch });

      const result = await provider.getItems();

      expect(result).toEqual([]);
    });
  });

  it('handles detection errors gracefully', async () => {
    const warnSpy = jest.spyOn(logger, 'warn');
    Object.defineProperty(process, 'platform', {
      get: () => {
        throw new Error('Platform detection failed');
      },
    });

    const result = await provider.getItems();

    expect(result).toEqual([]);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Error detecting OS information'),
      expect.any(Error),
    );
  });
});
