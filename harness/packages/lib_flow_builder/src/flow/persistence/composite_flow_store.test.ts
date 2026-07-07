/* eslint-disable no-underscore-dangle */
import { errAsync, okAsync } from 'neverthrow';
import { createFakePartial } from '@gitlab-org/test-utils';
import type { Flow, FlowId, NodeId } from '../types';
import { CatalogFlowStore } from './catalog_flow_store';
import { CompositeFlowStore } from './composite_flow_store';
import { FileBasedFlowStore } from './file_based_flow_store';
import type { FlowStoreError } from './flow_store';

function makeFlow(): Flow {
  const nodeId = 'node-1' as NodeId;
  return {
    id: 'flow-1' as FlowId,
    entryPoint: nodeId,
    nodes: {
      [nodeId]: {
        id: nodeId,
        label: 'Step One',
        type: 'agent',
        position: { x: 0, y: 0 },
        config: {
          promptMode: 'remote',
          promptId: 'p1',
          promptVersion: undefined,
          localPrompt: undefined,
          toolset: [],
        },
      },
    },
    edges: {},
  };
}

describe('CompositeFlowStore', () => {
  const flow = makeFlow();
  let fileStore: FileBasedFlowStore;
  let catalogStore: CatalogFlowStore;
  let composite: CompositeFlowStore;

  beforeEach(() => {
    fileStore = createFakePartial<FileBasedFlowStore>({
      initialize: jest.fn().mockReturnValue(okAsync(undefined)),
      loadFlow: jest.fn().mockReturnValue(okAsync(flow)),
      loadFlowYaml: jest.fn().mockReturnValue(okAsync('file-yaml')),
      saveFlow: jest.fn().mockReturnValue(okAsync(undefined)),
      listFlows: jest.fn().mockReturnValue(okAsync([flow])),
    });
    catalogStore = createFakePartial<CatalogFlowStore>({
      initialize: jest.fn().mockReturnValue(okAsync(undefined)),
      loadFlow: jest.fn().mockReturnValue(okAsync(flow)),
      loadFlowYaml: jest.fn().mockReturnValue(okAsync('catalog-yaml')),
      saveFlow: jest.fn().mockReturnValue(okAsync(undefined)),
    });
    composite = new CompositeFlowStore(fileStore, catalogStore);
  });

  it('routes catalog URIs to the catalog store', async () => {
    await composite.loadFlow('gitlab-catalog://flow/42');
    await composite.loadFlowYaml('gitlab-catalog://flow/42');
    await composite.saveFlow(flow, 'gitlab-catalog://flow/42');

    expect(catalogStore.loadFlow).toHaveBeenCalledTimes(1);
    expect(catalogStore.loadFlowYaml).toHaveBeenCalledTimes(1);
    expect(catalogStore.saveFlow).toHaveBeenCalledTimes(1);
    expect(fileStore.loadFlow).not.toHaveBeenCalled();
    expect(fileStore.loadFlowYaml).not.toHaveBeenCalled();
    expect(fileStore.saveFlow).not.toHaveBeenCalled();
  });

  it('routes non-catalog URIs to the file-based store', async () => {
    await composite.loadFlow('flow://default');
    await composite.loadFlowYaml('file:///tmp/flow.yml');
    await composite.saveFlow(flow, 'flow://default');

    expect(fileStore.loadFlow).toHaveBeenCalledTimes(1);
    expect(fileStore.loadFlowYaml).toHaveBeenCalledTimes(1);
    expect(fileStore.saveFlow).toHaveBeenCalledTimes(1);
    expect(catalogStore.loadFlow).not.toHaveBeenCalled();
    expect(catalogStore.loadFlowYaml).not.toHaveBeenCalled();
    expect(catalogStore.saveFlow).not.toHaveBeenCalled();
  });

  it('initializes both backing stores and listFlows delegates only to the file store', async () => {
    await composite.initialize();
    await composite.listFlows();

    expect(fileStore.initialize).toHaveBeenCalledTimes(1);
    expect(catalogStore.initialize).toHaveBeenCalledTimes(1);
    expect(fileStore.listFlows).toHaveBeenCalledTimes(1);
  });

  it('propagates errors from the routed store', async () => {
    const expected: FlowStoreError = { type: 'io_error', message: 'boom' };
    (catalogStore.loadFlow as jest.Mock).mockReturnValueOnce(errAsync(expected));

    const result = await composite.loadFlow('gitlab-catalog://flow/42');

    expect(result.isErr()).toBe(true);
    expect(result._unsafeUnwrapErr()).toEqual(expected);
  });
});
