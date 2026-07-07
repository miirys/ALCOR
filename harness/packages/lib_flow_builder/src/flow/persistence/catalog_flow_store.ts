import { ResultAsync, Result, errAsync, okAsync } from 'neverthrow';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { Logger, withPrefix } from '@gitlab-org/logging';
import {
  AiCatalogFlowItem,
  CreateCatalogFlowMutation,
  GetCatalogFlowQuery,
  GraphQLService,
  ListCatalogFlowsQuery,
  ProjectID,
  UpdateCatalogFlowMutation,
} from '@gitlab-org/graphql';
import * as yaml from 'js-yaml';
import { Flow, FlowId } from '../types';
import { conversionErrorToIssues, FlowValidationCode } from '../validation';
import { FlowStore, FlowStoreError } from './flow_store';
import { FlowResolver } from './resolver';
import { FLOW_V1_SCHEMA_VERSION } from './resolver/v1';
import {
  buildCatalogFlowUri,
  buildCatalogItemGlobalId,
  isCatalogFlowUri,
  parseCatalogFlowUri,
} from './catalog_uri';

export { buildCatalogFlowUri, buildCatalogItemGlobalId, isCatalogFlowUri, parseCatalogFlowUri };

const CATALOG_GLOBAL_ID_PREFIX = 'gid://gitlab/Ai::Catalog::Item/';

/**
 * Light-weight summary of a catalog flow item, suitable for picker UIs.
 */
export type CatalogFlowSummary = {
  uri: string;
  id: string;
  name: string;
  description: string;
  public: boolean;
  updatedAt: string;
  projectFullPath: string | null;
  latestVersionName: string | null;
};

/**
 * Pagination cursor returned alongside a page of summaries.
 */
export type CatalogFlowPage = {
  flows: CatalogFlowSummary[];
  pageInfo: {
    endCursor: string;
    hasNextPage: boolean;
  };
};

export type ListCatalogFlowsParams = {
  search?: string;
  first?: number;
  after?: string;
};

export type CreateCatalogFlowParams = {
  projectId: ProjectID;
  name: string;
  description: string;
  public: boolean;
  flow: Flow;
};

export type CreateCatalogFlowResult = {
  uri: string;
  summary: CatalogFlowSummary;
};

function toSummary(item: AiCatalogFlowItem): CatalogFlowSummary {
  const numericId = item.id.replace(CATALOG_GLOBAL_ID_PREFIX, '');
  return {
    uri: buildCatalogFlowUri(numericId),
    id: item.id,
    name: item.name,
    description: item.description,
    public: item.public,
    updatedAt: item.updatedAt,
    projectFullPath: item.project?.fullPath ?? null,
    latestVersionName: item.latestVersion?.versionName ?? null,
  };
}

/**
 * FlowStore implementation backed by GitLab's AI Catalog (GraphQL).
 *
 * Supports a single URI scheme: `gitlab-catalog://flow/<numeric-id>`.
 * Read paths use `aiCatalogItem`; saves call `aiCatalogFlowUpdate`. Creation
 * of a brand-new catalog flow is handled outside this store via a dedicated
 * mutation request, since the URI is unknown until the item exists.
 */
@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [Logger, FlowResolver, GraphQLService],
})
export class CatalogFlowStore implements FlowStore {
  readonly #logger: Logger;

  readonly #resolver: FlowResolver;

  readonly #graphql: GraphQLService;

  constructor(logger: Logger, resolver: FlowResolver, graphql: GraphQLService) {
    this.#logger = withPrefix(logger, '[CatalogFlowStore]');
    this.#resolver = resolver;
    this.#graphql = graphql;
  }

  initialize(): ResultAsync<void, FlowStoreError> {
    return okAsync(undefined);
  }

  loadFlow(uri: string): ResultAsync<Flow, FlowStoreError> {
    return this.#fetchYaml(uri).andThen((yamlContent) => this.#parseToFlow(yamlContent));
  }

  loadFlowYaml(uri: string): ResultAsync<string, FlowStoreError> {
    return this.#fetchYaml(uri);
  }

  saveFlow(flow: Flow, uri: string): ResultAsync<void, FlowStoreError> {
    const id = parseCatalogFlowUri(uri);
    if (!id) {
      return errAsync({
        type: 'validation_error',
        issues: [
          {
            severity: 'error',
            code: FlowValidationCode.Uri,
            message: `Invalid catalog flow URI: ${uri}`,
          },
        ],
      });
    }

    return this.#serializeYaml(flow).asyncAndThen((definition) =>
      ResultAsync.fromPromise(
        this.#graphql.execute(UpdateCatalogFlowMutation, {
          id: buildCatalogItemGlobalId(id),
          definition,
        }),
        (error): FlowStoreError => ({
          type: 'io_error',
          message: `Failed to update catalog flow: ${error instanceof Error ? error.message : String(error)}`,
        }),
      ).andThen((data): ResultAsync<void, FlowStoreError> => {
        const { errors } = data.aiCatalogFlowUpdate;
        if (errors && errors.length > 0) {
          return errAsync({
            type: 'validation_error',
            issues: errors.map((message) => ({
              severity: 'error' as const,
              code: FlowValidationCode.Catalog,
              message,
            })),
          });
        }
        return okAsync(undefined);
      }),
    );
  }

  /**
   * Listing is intentionally a no-op: catalog enumeration uses
   * `listCatalogFlows`, not this interface.
   */
  listFlows(): ResultAsync<Flow[], FlowStoreError> {
    return okAsync([]);
  }

  /**
   * List catalog flows visible to the current user, paginated.
   *
   * Returns lightweight summaries — call `loadFlow(uri)` on a selection to
   * fetch the full flow.
   */
  listCatalogFlows({
    search,
    first,
    after,
  }: ListCatalogFlowsParams): ResultAsync<CatalogFlowPage, FlowStoreError> {
    return ResultAsync.fromPromise(
      this.#graphql.execute(ListCatalogFlowsQuery, {
        search: search ?? null,
        first: first ?? null,
        after: after ?? null,
      }),
      (error): FlowStoreError => ({
        type: 'io_error',
        message: `Failed to list catalog flows: ${error instanceof Error ? error.message : String(error)}`,
      }),
    ).map((data): CatalogFlowPage => {
      const edges = data.aiCatalogItems.edges ?? [];
      return {
        flows: edges.map((edge) => toSummary(edge.node)),
        pageInfo: {
          endCursor: data.aiCatalogItems.pageInfo.endCursor,
          hasNextPage: data.aiCatalogItems.pageInfo.hasNextPage,
        },
      };
    });
  }

  /**
   * Create a new catalog flow item with the given metadata, seeded with the
   * provided flow as its initial version.
   *
   * Returns the opaque catalog URI that the frontend should use for
   * subsequent loads/saves.
   */
  createFlow({
    projectId,
    name,
    description,
    public: isPublic,
    flow,
  }: CreateCatalogFlowParams): ResultAsync<CreateCatalogFlowResult, FlowStoreError> {
    return this.#serializeYaml(flow).asyncAndThen((definition) =>
      ResultAsync.fromPromise(
        this.#graphql.execute(CreateCatalogFlowMutation, {
          projectId,
          name,
          description,
          public: isPublic,
          definition,
        }),
        (error): FlowStoreError => ({
          type: 'io_error',
          message: `Failed to create catalog flow: ${error instanceof Error ? error.message : String(error)}`,
        }),
      ).andThen((data): ResultAsync<CreateCatalogFlowResult, FlowStoreError> => {
        const { errors, item } = data.aiCatalogFlowCreate;
        if (errors && errors.length > 0) {
          return errAsync({
            type: 'validation_error',
            issues: errors.map((message) => ({
              severity: 'error' as const,
              code: FlowValidationCode.Catalog,
              message,
            })),
          });
        }

        if (!item) {
          this.#logger.warn('aiCatalogFlowCreate returned no item without explicit errors');
          return errAsync({
            type: 'io_error',
            message: 'Catalog flow creation returned no item',
          });
        }

        const summary = toSummary(item);
        return okAsync({ uri: summary.uri, summary });
      }),
    );
  }

  #fetchYaml(uri: string): ResultAsync<string, FlowStoreError> {
    const id = parseCatalogFlowUri(uri);
    if (!id) {
      return errAsync({
        type: 'validation_error',
        issues: [
          {
            severity: 'error',
            code: FlowValidationCode.Uri,
            message: `Invalid catalog flow URI: ${uri}`,
          },
        ],
      });
    }

    return ResultAsync.fromPromise(
      this.#graphql.execute(GetCatalogFlowQuery, { id: buildCatalogItemGlobalId(id) }),
      (error): FlowStoreError => ({
        type: 'io_error',
        message: `Failed to fetch catalog flow: ${error instanceof Error ? error.message : String(error)}`,
      }),
    ).andThen((data): ResultAsync<string, FlowStoreError> => {
      const item = data.aiCatalogItem;
      if (!item) {
        return errAsync({ type: 'not_found', flowId: uri as FlowId });
      }
      const definition = item.latestVersion?.definition;
      if (!definition) {
        return errAsync({
          type: 'invalid_format',
          message: 'Catalog flow has no YAML definition',
        });
      }
      return okAsync(definition);
    });
  }

  #parseToFlow(yamlContent: string): Result<Flow, FlowStoreError> {
    return Result.fromThrowable(
      () => yaml.load(yamlContent) as unknown,
      (error): FlowStoreError => ({
        type: 'invalid_format',
        message: 'Invalid YAML format',
        details: [error instanceof Error ? error.message : String(error)],
      }),
    )().andThen((data) =>
      this.#resolver.toFlow(data).mapErr(
        (conversionError): FlowStoreError => ({
          type: 'validation_error',
          issues: conversionErrorToIssues(conversionError),
        }),
      ),
    );
  }

  #serializeYaml(flow: Flow): Result<string, FlowStoreError> {
    return this.#resolver
      .fromFlow(flow, FLOW_V1_SCHEMA_VERSION)
      .mapErr(
        (conversionError): FlowStoreError => ({
          type: 'validation_error',
          issues: conversionErrorToIssues(conversionError),
        }),
      )
      .andThen((flowV1) =>
        Result.fromThrowable(
          () => yaml.dump(flowV1, { indent: 2, lineWidth: 100, noRefs: true }),
          (error): FlowStoreError => ({
            type: 'invalid_format',
            message: 'Failed to serialize to YAML',
            details: [error instanceof Error ? error.message : String(error)],
          }),
        )(),
      );
  }
}
