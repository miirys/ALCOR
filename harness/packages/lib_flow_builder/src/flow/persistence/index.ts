import { ServiceCollection } from '@gitlab/needle';
import { FileBasedFlowStore } from './file_based_flow_store';
import { CatalogFlowStore } from './catalog_flow_store';
import { CompositeFlowStore } from './composite_flow_store';
import { FlowResolver } from './resolver';
import { FlowV1Converter } from './resolver/v1';

export { FlowStore } from './flow_store';
export { CatalogFlowStore } from './catalog_flow_store';
export {
  buildCatalogFlowUri,
  buildCatalogItemGlobalId,
  isCatalogFlowUri,
  parseCatalogFlowUri,
} from './catalog_uri';
export type {
  CatalogFlowPage,
  CatalogFlowSummary,
  CreateCatalogFlowParams,
  CreateCatalogFlowResult,
  ListCatalogFlowsParams,
} from './catalog_flow_store';
export function registerFlowPersistenceServices(services: ServiceCollection) {
  services.addClass(FlowV1Converter);
  services.addClass(FlowResolver);
  services.addClass(FileBasedFlowStore);
  services.addClass(CatalogFlowStore);
  services.addClass(CompositeFlowStore);
}
