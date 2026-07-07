import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { TestLogger } from '@gitlab-org/logging';
import { DefaultConfigService } from '@gitlab-org/config';
import { createFakePartial } from '@gitlab-org/test-utils';
import { type AIContextItem } from '@gitlab-org/ai-context';
import type { ShellDetector, ShellInfo } from '@gitlab-org/ai-context/node';
import type { ShellContextProvider as ShellContextProviderType } from './shell';

// Declared at module scope so the ShellDetector mock factory can close over it;
// reassigned in beforeEach so each test gets a fresh mock with zero call count.
let mockDetectSystemShell: jest.Mock<ShellDetector['detectSystemShell']>;

jest.unstable_mockModule('@gitlab-org/ai-context/node', () => ({
  ShellDetector: jest.fn(() => ({ detectSystemShell: mockDetectSystemShell })),
  buildShellContextItems: mockBuildShellContextItems,
}));

const mockBuildShellContextItems = jest.fn<(shellInfo: ShellInfo) => AIContextItem[]>();

const { ShellContextProvider } = await import('./shell');

describe('ShellContextProvider', () => {
  let provider: ShellContextProviderType;
  const fakeItems = [createFakePartial<AIContextItem>({ id: 'shell-item' })];

  beforeEach(() => {
    mockDetectSystemShell = jest
      .fn<ShellDetector['detectSystemShell']>()
      .mockReturnValue(createFakePartial<ShellInfo>({ shellName: 'bash', shellType: 'unix' }));
    mockBuildShellContextItems.mockReturnValue(fakeItems);
    provider = new ShellContextProvider(new TestLogger(), new DefaultConfigService());
  });

  describe('getItems', () => {
    it('delegates to the detector and returns built items', async () => {
      expect(await provider.getItems()).toBe(fakeItems);
      expect(mockDetectSystemShell).toHaveBeenCalledTimes(1);
    });

    it('returns empty array when no shell is detected', async () => {
      mockDetectSystemShell.mockReturnValue(null);
      expect(await provider.getItems()).toEqual([]);
    });

    it('caches the result across multiple calls', async () => {
      await provider.getItems();
      await provider.getItems();
      expect(mockDetectSystemShell).toHaveBeenCalledTimes(1);
    });
  });

  describe('precalculate', () => {
    it('pre-computes so subsequent getItems reuses the cache', async () => {
      await provider.precalculate();
      await provider.getItems();
      expect(mockDetectSystemShell).toHaveBeenCalledTimes(1);
    });

    it('forces a fresh calculation on each call', async () => {
      await provider.precalculate();
      await provider.precalculate();
      expect(mockDetectSystemShell).toHaveBeenCalledTimes(2);
    });
  });
});
