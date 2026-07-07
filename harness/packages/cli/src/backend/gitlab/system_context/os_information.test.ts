import { TestLogger } from '@gitlab-org/logging';
import type { AIContextItem } from '@gitlab-org/ai-context';
import { OSInformationContextProvider } from './os_information';

interface OSInformationData {
  platform: string;
  architecture: string;
}

describe('OSInformationContextProvider', () => {
  let provider: OSInformationContextProvider;
  let logger: TestLogger;
  let originalPlatform: NodeJS.Platform;
  let originalArch: string;

  const expectOSResult = (
    result: AIContextItem[],
    expectedOSInfo: OSInformationData,
    expectedSecondaryText: string,
  ) => {
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      category: 'os_information',
      id: 'os_information',
      content: `<os><platform>${expectedOSInfo.platform}</platform><architecture>${expectedOSInfo.architecture}</architecture></os>`,
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
    provider = new OSInformationContextProvider(logger);
    originalPlatform = process.platform;
    originalArch = process.arch;
  });

  afterEach(() => {
    Object.defineProperty(process, 'platform', { value: originalPlatform });
    Object.defineProperty(process, 'arch', { value: originalArch });
  });

  it('detects OS information correctly and formats as XML', async () => {
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

  it('generates correct XML format matching duo-workflow-executor', async () => {
    Object.defineProperty(process, 'platform', { value: 'darwin' });
    Object.defineProperty(process, 'arch', { value: 'arm64' });

    const result = await provider.getItems();

    expect(result[0].content).toBe(
      `<os><platform>darwin</platform><architecture>arm64</architecture></os>`,
    );
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
});
