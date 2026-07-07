import { Disposable } from '@gitlab-org/disposable';
import { StateCheckContext, StateCheckId } from '@gitlab-org/core';

// Structural match for src/common/feature_state/state_check.ts. Duplicated
// intentionally so lib_sandbox stays independent of src/common; TypeScript
// structural typing catches any drift at the @Injectable site.
export interface SandboxStateCheckChangedEventData {
  checkId: StateCheckId;
  engaged: boolean;
  details?: string;
}

export interface SandboxStateCheck<T extends StateCheckId> {
  id: T;
  engaged: boolean;
  details?: string;
  context?: StateCheckContext<T>;
  onChanged: (listener: (data: SandboxStateCheckChangedEventData) => void) => Disposable;
}
