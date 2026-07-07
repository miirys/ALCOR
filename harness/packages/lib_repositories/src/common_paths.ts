const ignoredPaths = [
  // Common build paths
  'node_modules',
  'dist',

  // Common IDE paths
  '.bundle',
  '.idea',
  '.vscode',
  '__pycache__',
  '.mypy_cache',
  '.pytest_cache',
  '.tox',
  '.venv',
];

// Export the individual paths for programmatic use
export const IGNORED_DIRECTORY_NAMES = ignoredPaths;
