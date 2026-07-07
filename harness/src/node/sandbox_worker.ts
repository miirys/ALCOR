// Sandbox worker entry point for desktop (esbuild) bundling.
// Produces sandbox_worker.js next to main-bundle-node.js,
// matching what DefaultWorkerProcessManager.#resolveWorkerScript() looks for.
import '@gitlab-org/sandbox/worker';
