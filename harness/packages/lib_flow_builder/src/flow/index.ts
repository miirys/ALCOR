import { ServiceCollection } from '@gitlab/needle';
import { registerFlowPersistenceServices } from './persistence';
import { registerDuoFlowWebviewServices } from './webview';
import { registerFlowRegistyServices } from './registry';

export type * from './types';
export type { ToolDefinition, RuntimeProvidedVariableDefinition } from './registry';
export type { CatalogFlowPage, CatalogFlowSummary } from './persistence';
export type { FlowValidationIssue, ValidationSuggestion } from './validation';
export { FlowValidationCode } from './validation';
export { conversionErrorToIssues, flowStoreErrorToIssues } from './validation';
export function registerDuoFlowServices(services: ServiceCollection): ServiceCollection {
  registerFlowRegistyServices(services);
  registerFlowPersistenceServices(services);
  registerDuoFlowWebviewServices(services);

  return services;
}
