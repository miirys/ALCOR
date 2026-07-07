// Sandbox worker entry point for CLI bundling.
// Bun uses the entry-point filename for the output, so this produces sandbox_worker.js,
// matching what DefaultWorkerProcessManager.#resolveWorkerScript() looks for.
import '@gitlab-org/sandbox/worker';
