import { join } from 'node:path';
import Parser from 'web-tree-sitter';
import { getAssetsRootPath } from '../assets_manager';
import { DesktopTreeSitterParser } from './parser';

jest.mock('web-tree-sitter', () => ({
  __esModule: true,
  default: { init: jest.fn().mockResolvedValue(undefined) },
}));

jest.mock('../assets_manager', () => ({
  getAssetsRootPath: jest.fn(() => '/fake/assets/root'),
}));

describe('DesktopTreeSitterParser.init', () => {
  const originalBundleEnvironment = process.env.BUNDLE_ENVIRONMENT;

  afterEach(() => {
    process.env.BUNDLE_ENVIRONMENT = originalBundleEnvironment;
  });

  it('passes locateFile resolving against getAssetsRootPath when running as bun-compiled binary', async () => {
    process.env.BUNDLE_ENVIRONMENT = 'bun';

    await new DesktopTreeSitterParser().init();

    expect(Parser.init).toHaveBeenCalledWith(
      expect.objectContaining({ locateFile: expect.any(Function) }),
    );
    const { locateFile } = (Parser.init as jest.Mock).mock.calls[0][0];
    expect(locateFile('tree-sitter.wasm')).toBe(join(getAssetsRootPath(), 'tree-sitter.wasm'));
  });

  it('calls Parser.init without options when not bun-compiled', async () => {
    delete process.env.BUNDLE_ENVIRONMENT;

    await new DesktopTreeSitterParser().init();

    expect(Parser.init).toHaveBeenCalledWith(undefined);
  });
});
