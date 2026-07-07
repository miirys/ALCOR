import { createInterfaceId } from '@gitlab/needle';

export interface UsageQuotaService {
  checkUsageCreditsExceeded(
    signal: AbortSignal,
    rootNamespaceId?: string,
    workflowDefinition?: string,
    projectId?: string,
  ): Promise<boolean>;
}

export const UsageQuotaService = createInterfaceId<UsageQuotaService>('UsageQuotaService');
