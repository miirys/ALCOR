import { createInterfaceId } from '@gitlab/needle';
import { DuoFeature } from '@gitlab-org/duo-feature-access';
import { type AIContextItem } from '../index';

export interface WorkflowContext {
  sessionId: string;
  cwd: string;
  source: 'startup' | 'resume';
}

export interface SystemContextProvider {
  readonly chatRequiredFeature?: DuoFeature;
  getItems(context?: WorkflowContext): Promise<AIContextItem[]>;
  /**
   * Called on LSP `onInitialized`
   */
  precalculate?(): Promise<void>;
  /**
   * When defined, called on each workflow start instead of precalculate().
   * Use this for providers that need to refresh data that cannot be watched for changes.
   * And needs to be recalculated on workflow precreation instead
   * In prewarming context provided cache should happen as eraly as possible
   * to avoild delay in workflow start
   */
  precalculateOnWorkflowStart?(): Promise<void>;
}

export const SystemContextProvider =
  createInterfaceId<SystemContextProvider>('SystemContextProvider');
