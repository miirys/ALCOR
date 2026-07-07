import { getDuoConfigDir } from '@gitlab-org/ai-configuration';
import { getKnownMarketplacesFilePath, getMarketplacesDir, getInstallLocation } from './paths';

jest.mock('@gitlab-org/ai-configuration', () => ({
  getDuoConfigDir: jest.fn(),
}));

const mockGetDuoConfigDir = getDuoConfigDir as jest.MockedFunction<typeof getDuoConfigDir>;

describe('marketplace/paths', () => {
  describe('when the Duo config dir resolves', () => {
    beforeEach(() => {
      mockGetDuoConfigDir.mockReturnValue('/home/user/.config/gitlab/duo');
    });

    it('places known_marketplaces.json at the config root', () => {
      expect(getKnownMarketplacesFilePath()).toBe(
        '/home/user/.config/gitlab/duo/known_marketplaces.json',
      );
    });

    it('places catalogs under marketplaces/', () => {
      expect(getMarketplacesDir()).toBe('/home/user/.config/gitlab/duo/marketplaces');
    });

    it('names an install location after the marketplace', () => {
      expect(getInstallLocation('duo-demo')).toBe(
        '/home/user/.config/gitlab/duo/marketplaces/duo-demo',
      );
    });
  });

  describe('when the Duo config dir cannot be resolved', () => {
    beforeEach(() => {
      mockGetDuoConfigDir.mockReturnValue(undefined);
    });

    it('throws a clear error', () => {
      expect(() => getKnownMarketplacesFilePath()).toThrow(
        /Unable to resolve the Duo config directory/,
      );
    });
  });
});
