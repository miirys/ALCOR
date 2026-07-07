/* eslint-disable no-underscore-dangle */
import { ok, err } from 'neverthrow';
import { createFakePartial } from '@gitlab-org/test-utils';
import { Logger } from '@gitlab-org/logging';
import {
  CreateCatalogFlowMutation,
  GetCatalogFlowQuery,
  GraphQLService,
  ListCatalogFlowsQuery,
  UpdateCatalogFlowMutation,
} from '@gitlab-org/graphql';
import type { Flow, FlowId, NodeId } from '../types';
import { FlowResolver } from './resolver';
import { ConversionError } from './resolver/errors';
import {
  buildCatalogFlowUri,
  buildCatalogItemGlobalId,
  CatalogFlowStore,
  isCatalogFlowUri,
  parseCatalogFlowUri,
} from './catalog_flow_store';

const VALID_URI = 'gitlab-catalog://flow/42';
const VALID_GID = 'gid://gitlab/Ai::Catalog::Item/42';

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

function makeYaml(): string {
  return `version: "v1"
environment: ambient
components:
  - name: step_one
    type: AgentComponent
    prompt_id: p1
    toolset: []
routers:
  - from: step_one
    to: end
flow:
  entry_point: step_one
`;
}

function makeItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: VALID_GID,
    name: 'My Flow',
    description: 'desc',
    public: false,
    updatedAt: '2026-04-27T00:00:00Z',
    project: { id: 'gid://gitlab/Project/7', fullPath: 'group/proj' },
    latestVersion: {
      id: 'gid://gitlab/Ai::Catalog::ItemVersion/1',
      versionName: '1.0.0',
      humanVersionName: 'v1.0.0',
      released: true,
      releasedAt: '2026-04-27T00:00:00Z',
      updatedAt: '2026-04-27T00:00:00Z',
      definition: makeYaml(),
    },
    ...overrides,
  };
}

describe('catalog_flow_store helpers', () => {
  it('builds catalog URIs and global IDs from a numeric id', () => {
    expect(buildCatalogFlowUri('42')).toBe(VALID_URI);
    expect(buildCatalogItemGlobalId('42')).toBe(VALID_GID);
  });

  it('detects catalog URIs', () => {
    expect(isCatalogFlowUri(VALID_URI)).toBe(true);
    expect(isCatalogFlowUri('file:///tmp/flow.yml')).toBe(false);
    expect(isCatalogFlowUri('flow://default')).toBe(false);
  });

  it('parses the numeric id from a catalog URI', () => {
    expect(parseCatalogFlowUri(VALID_URI)).toBe('42');
    expect(parseCatalogFlowUri('gitlab-catalog://flow/')).toBeNull();
    expect(parseCatalogFlowUri('file:///x')).toBeNull();
  });
});

describe('CatalogFlowStore', () => {
  const flow = makeFlow();
  let mockExecute: jest.Mock;
  let mockResolver: FlowResolver;
  let store: CatalogFlowStore;

  beforeEach(() => {
    mockExecute = jest.fn();
    const graphql = createFakePartial<GraphQLService>({ execute: mockExecute });
    mockResolver = createFakePartial<FlowResolver>({
      toFlow: jest.fn().mockReturnValue(ok(flow)),
      fromFlow: jest.fn().mockReturnValue(
        ok({
          version: 'v1',
          environment: 'ambient',
          components: [],
          routers: [],
          flow: { entry_point: 'step_one' },
        }),
      ),
    });
    const logger = createFakePartial<Logger>({
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      info: jest.fn(),
    });
    store = new CatalogFlowStore(logger, mockResolver, graphql);
  });

  describe('loadFlow', () => {
    it('returns the resolved flow on success', async () => {
      mockExecute.mockResolvedValueOnce({ aiCatalogItem: makeItem() });

      const result = await store.loadFlow(VALID_URI);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toBe(flow);
      expect(mockExecute).toHaveBeenCalledWith(GetCatalogFlowQuery, { id: VALID_GID });
    });

    it('returns not_found when the item does not exist', async () => {
      mockExecute.mockResolvedValueOnce({ aiCatalogItem: null });

      const result = await store.loadFlow(VALID_URI);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr()).toEqual({ type: 'not_found', flowId: VALID_URI });
    });

    it('returns invalid_format when the latest version has no YAML definition', async () => {
      mockExecute.mockResolvedValueOnce({
        aiCatalogItem: makeItem({ latestVersion: { definition: null } }),
      });

      const result = await store.loadFlow(VALID_URI);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('invalid_format');
    });

    it('returns validation_error on invalid catalog URI', async () => {
      const result = await store.loadFlow('file:///nope');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('validation_error');
      expect(mockExecute).not.toHaveBeenCalled();
    });

    it('maps GraphQL exceptions to io_error', async () => {
      mockExecute.mockRejectedValueOnce(new Error('network down'));

      const result = await store.loadFlow(VALID_URI);

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe('io_error');
      if (error.type === 'io_error') {
        expect(error.message).toContain('network down');
      }
    });

    it('returns validation_error when the resolver rejects the parsed YAML', async () => {
      mockExecute.mockResolvedValueOnce({ aiCatalogItem: makeItem() });
      (mockResolver.toFlow as jest.Mock).mockReturnValueOnce(
        err(
          ConversionError.schemaValidation('bad', [
            { severity: 'error', code: 'flow.schema', message: 'missing field' },
          ]),
        ),
      );

      const result = await store.loadFlow(VALID_URI);

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe('validation_error');
      if (error.type === 'validation_error') {
        expect(error.issues).toEqual([
          { severity: 'error', code: 'flow.schema', message: 'missing field' },
        ]);
      }
    });
  });

  describe('loadFlowYaml', () => {
    it('returns the raw YAML string', async () => {
      mockExecute.mockResolvedValueOnce({ aiCatalogItem: makeItem() });

      const result = await store.loadFlowYaml(VALID_URI);

      expect(result._unsafeUnwrap()).toContain('version: "v1"');
    });
  });

  describe('saveFlow', () => {
    it('updates the catalog item with serialized YAML', async () => {
      mockExecute.mockResolvedValueOnce({ aiCatalogFlowUpdate: { item: makeItem(), errors: [] } });

      const result = await store.saveFlow(flow, VALID_URI);

      expect(result.isOk()).toBe(true);
      expect(mockExecute).toHaveBeenCalledWith(UpdateCatalogFlowMutation, {
        id: VALID_GID,
        definition: expect.stringContaining('version: v1'),
      });
    });

    it('propagates server-side validation errors', async () => {
      mockExecute.mockResolvedValueOnce({
        aiCatalogFlowUpdate: { item: null, errors: ['bad schema'] },
      });

      const result = await store.saveFlow(flow, VALID_URI);

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe('validation_error');
      if (error.type === 'validation_error') {
        expect(error.issues).toEqual([
          { severity: 'error', code: 'flow.catalog', message: 'bad schema' },
        ]);
      }
    });

    it('rejects invalid URIs without calling GraphQL', async () => {
      const result = await store.saveFlow(flow, 'file:///nope');

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('validation_error');
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });

  describe('listCatalogFlows', () => {
    it('maps the GraphQL connection to summaries with catalog URIs', async () => {
      mockExecute.mockResolvedValueOnce({
        aiCatalogItems: {
          edges: [{ node: makeItem() }],
          pageInfo: {
            startCursor: 'a',
            endCursor: 'b',
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      });

      const result = await store.listCatalogFlows({ search: 'foo', first: 20 });

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toEqual({
        flows: [
          {
            uri: VALID_URI,
            id: VALID_GID,
            name: 'My Flow',
            description: 'desc',
            public: false,
            updatedAt: '2026-04-27T00:00:00Z',
            projectFullPath: 'group/proj',
            latestVersionName: '1.0.0',
          },
        ],
        pageInfo: { endCursor: 'b', hasNextPage: false },
      });
      expect(mockExecute).toHaveBeenCalledWith(ListCatalogFlowsQuery, {
        search: 'foo',
        first: 20,
        after: null,
      });
    });

    it('returns an empty list when the connection has no edges', async () => {
      mockExecute.mockResolvedValueOnce({
        aiCatalogItems: {
          edges: null,
          pageInfo: {
            startCursor: '',
            endCursor: '',
            hasNextPage: false,
            hasPreviousPage: false,
          },
        },
      });

      const result = await store.listCatalogFlows({});

      expect(result._unsafeUnwrap().flows).toEqual([]);
    });
  });

  describe('createFlow', () => {
    const params = {
      projectId: 'gid://gitlab/Project/7',
      name: 'New Flow',
      description: 'desc',
      public: false,
      flow,
    };

    it('returns the new URI and summary on success', async () => {
      mockExecute.mockResolvedValueOnce({
        aiCatalogFlowCreate: { item: makeItem(), errors: [] },
      });

      const result = await store.createFlow(params);

      expect(result.isOk()).toBe(true);
      expect(result._unsafeUnwrap()).toMatchObject({
        uri: VALID_URI,
        summary: { id: VALID_GID, name: 'My Flow', uri: VALID_URI },
      });
      expect(mockExecute).toHaveBeenCalledWith(CreateCatalogFlowMutation, {
        projectId: 'gid://gitlab/Project/7',
        name: 'New Flow',
        description: 'desc',
        public: false,
        definition: expect.stringContaining('version: v1'),
      });
    });

    it('propagates validation errors from the server', async () => {
      mockExecute.mockResolvedValueOnce({
        aiCatalogFlowCreate: { item: null, errors: ['name taken'] },
      });

      const result = await store.createFlow(params);

      expect(result.isErr()).toBe(true);
      const error = result._unsafeUnwrapErr();
      expect(error.type).toBe('validation_error');
      if (error.type === 'validation_error') {
        expect(error.issues).toEqual([
          { severity: 'error', code: 'flow.catalog', message: 'name taken' },
        ]);
      }
    });

    it('treats a missing item without explicit errors as io_error', async () => {
      mockExecute.mockResolvedValueOnce({
        aiCatalogFlowCreate: { item: null, errors: [] },
      });

      const result = await store.createFlow(params);

      expect(result.isErr()).toBe(true);
      expect(result._unsafeUnwrapErr().type).toBe('io_error');
    });
  });

  describe('listFlows (FlowStore interface)', () => {
    it('returns an empty list and does not call GraphQL', async () => {
      const result = await store.listFlows();

      expect(result._unsafeUnwrap()).toEqual([]);
      expect(mockExecute).not.toHaveBeenCalled();
    });
  });
});
