import { minimatch } from 'minimatch';
import { URI } from 'vscode-uri';
import { COMMON_PATHS_PATTERN } from './glob_settings';

describe('IGNORED_PATHS_PATTERN', () => {
  const options = { dot: true };

  const pathsToIgnore = [
    '.git/lfs/objects/00/11/0011223344556677889900112233445566778899',
    '.git/logs/HEAD',
    '.git/objects/00/11223344556677889900112233445566778899',
    '.git/worktrees/feature-branch/FETCH_HEAD',
    '.git/refs/remotes/origin/HEAD',
    'node_modules/package/index.js',
    'dist/app.js',
    '.bundle/config',
    '.idea/workspace.xml',
    '.vscode/settings.json',
    '__pycache__/module.pyc',
    '.mypy_cache/3.8/cache.json',
    '.pytest_cache/v/cache/nodeids',
    '.tox/log/log1.log',
    '.venv/bin/activate',
  ];

  const pathsToInclude = [
    'file.txt',
    '.gitignore',
    '.git/config',
    '.git/HEAD',
    '.git/hooks/pre-commit',
    '.git/info/exclude',
    '.git/refs/heads/main',
    'src/index.ts',
    'README.md',
    'src/components/Button.tsx',
    'tests/unit/test_api.py',
    '.git/something/else',
    'app/assets/images/logo.png',
    'crates/package/src/main.rs',
  ];

  test('correctly ignores paths that should be ignored', () => {
    for (const path of pathsToIgnore) {
      const testPath = URI.file(`workspace/${path}/test.file`).toString();
      const matched = minimatch(testPath, COMMON_PATHS_PATTERN, options);
      expect(matched ? testPath : '').toBe(testPath);
    }
  });

  test('correctly includes paths that should not be ignored', () => {
    for (const path of pathsToInclude) {
      const testPath = URI.file(`workspace/${path}/test.file`).toString();
      const matched = minimatch(testPath, COMMON_PATHS_PATTERN, options);
      expect(matched ? '' : testPath).toBe(testPath);
    }
  });
});
