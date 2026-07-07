import { createInterfaceId } from '@gitlab/needle';

export interface CurrentOs {
  name: string | null;
}

export const CurrentOs = createInterfaceId<CurrentOs>('CurrentOs');
