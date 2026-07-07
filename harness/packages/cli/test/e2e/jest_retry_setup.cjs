// Retry each failed test case up to 2 times.
// This replaces CI job-level retry — it's faster because it skips
// the full rebuild/reinstall cycle and directly re-runs the failed test.

// CJS file because `jest` global isn't available in ESM setupFilesAfterEnv.
jest.retryTimes(2, { logErrorsBeforeRetry: true });
