import { join } from 'node:path';
import { getAssetsRootPath } from './assets_manager';

describe('Assets Manager', () => {
  describe('getAssetsRootPath', () => {
    it.each([
      { isBundled: 'true', expectedPath: __dirname },
      { isBundled: undefined, expectedPath: join(__dirname, '../../') },
    ])(
      'should return correct path when IS_BUNDLED is $isBundled',
      ({ isBundled, expectedPath }) => {
        process.env.IS_BUNDLED = isBundled;
        expect(getAssetsRootPath()).toBe(expectedPath);
      },
    );
  });
});
