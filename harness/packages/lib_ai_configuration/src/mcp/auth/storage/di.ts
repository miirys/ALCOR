import { createFactoryDescriptor, ServiceCollection, ServiceLifetime } from '@gitlab/needle';

import { TokenStorage, ClientInfoStorage, Token, ClientInfo } from './types';
import { MemoryAuthStorage } from './services/memory';

export function registerAuthStorageServices(
  serviceCollection: ServiceCollection,
): ServiceCollection {
  serviceCollection.add(
    createFactoryDescriptor({
      aliases: [TokenStorage],
      lifetime: ServiceLifetime.Singleton,
      factory: () => new MemoryAuthStorage(Token, 'Token'),
    }),
  );

  serviceCollection.add(
    createFactoryDescriptor({
      aliases: [ClientInfoStorage],
      lifetime: ServiceLifetime.Singleton,
      factory: () => new MemoryAuthStorage(ClientInfo, 'ClientInfo'),
    }),
  );

  return serviceCollection;
}
