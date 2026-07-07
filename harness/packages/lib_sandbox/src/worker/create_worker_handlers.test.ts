import { TestLogger } from '@gitlab-org/logging';
import { createWorkerHandlers } from './create_worker_handlers';

describe('createWorkerHandlers', () => {
  it('creates all expected action handlers', () => {
    const handlers = createWorkerHandlers(new TestLogger());

    const handlerNames = handlers.map((h) => h.name).sort();
    expect(handlerNames).toEqual([
      'create_file_with_contents',
      'edit_file',
      'find_files',
      'gitlab_api_request',
      'grep',
      'list_dir',
      'mkdir',
      'read_file',
      'read_files',
      'run_command',
      'shell_command',
    ]);
  });

  it('each handler has a canHandle method', () => {
    const handlers = createWorkerHandlers(new TestLogger());
    for (const handler of handlers) {
      expect(typeof handler.canHandle).toBe('function');
    }
  });
});
