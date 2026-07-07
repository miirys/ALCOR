import { createInterfaceId } from '@gitlab/needle';
import { EnvInfo } from '@gitlab-org/tui';

export interface RuntimeContext {
  cliVersion: string;
  envInfo: EnvInfo;
}

export const RuntimeContext = createInterfaceId<RuntimeContext>('RuntimeContext');
