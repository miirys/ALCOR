import { ResultAsync } from 'neverthrow';
import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { Flow } from '../types';
import { FlowStore, FlowStoreError } from './flow_store';
import { FileBasedFlowStore } from './file_based_flow_store';
import { CatalogFlowStore, isCatalogFlowUri } from './catalog_flow_store';

/**
 * FlowStore implementation that dispatches to a backing store based on the
 * URI scheme.
 *
 * The frontend treats URIs as opaque handles. This store inspects the scheme
 * and routes to the appropriate backend (catalog vs. local file). Each
 * backing store owns its own scheme-level dispatch and error semantics.
 */
@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [FileBasedFlowStore, CatalogFlowStore],
})
@Implements(FlowStore)
export class CompositeFlowStore implements FlowStore {
  readonly #fileStore: FileBasedFlowStore;

  readonly #catalogStore: CatalogFlowStore;

  constructor(fileStore: FileBasedFlowStore, catalogStore: CatalogFlowStore) {
    this.#fileStore = fileStore;
    this.#catalogStore = catalogStore;
  }

  initialize(): ResultAsync<void, FlowStoreError> {
    return this.#fileStore.initialize().andThen(() => this.#catalogStore.initialize());
  }

  loadFlow(uri: string): ResultAsync<Flow, FlowStoreError> {
    return this.#routeByUri(uri).loadFlow(uri);
  }

  loadFlowYaml(uri: string): ResultAsync<string, FlowStoreError> {
    return this.#routeByUri(uri).loadFlowYaml(uri);
  }

  saveFlow(flow: Flow, uri: string): ResultAsync<void, FlowStoreError> {
    return this.#routeByUri(uri).saveFlow(flow, uri);
  }

  /**
   * Listing returns the file-based store's flows only.
   *
   * Catalog enumeration is paginated/searchable and uses its own request
   * handler — collecting it through the FlowStore interface is the wrong
   * shape.
   */
  listFlows(): ResultAsync<Flow[], FlowStoreError> {
    return this.#fileStore.listFlows();
  }

  #routeByUri(uri: string): FlowStore {
    return isCatalogFlowUri(uri) ? this.#catalogStore : this.#fileStore;
  }
}
