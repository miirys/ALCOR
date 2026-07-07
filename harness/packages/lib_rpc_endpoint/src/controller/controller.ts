import { RpcMessageDefinition } from '@gitlab-org/rpc';
import { Endpoint, EndpointProvider } from '../types';
import { createEndpoint } from '../create_endpoint';
import { getEndpointMetadata } from './metadata';
import { Constructor } from './types';

type ControllerEndpointMetadata = RpcMessageDefinition & {
  classMethodName: string;
};

function getControllerEndpointMetadata<T extends Constructor>(
  target: T,
): ControllerEndpointMetadata[] {
  const endpoints: ControllerEndpointMetadata[] = [];

  let proto = target.prototype;
  while (proto && proto !== Object.prototype) {
    const props = Object.getOwnPropertyNames(proto);

    for (const prop of props) {
      const descriptor = Object.getOwnPropertyDescriptor(proto, prop);
      if (descriptor && typeof descriptor.value === 'function') {
        const metadata = getEndpointMetadata(descriptor.value);
        if (metadata) {
          endpoints.push({
            ...metadata,
            classMethodName: prop,
          });
        }
      }
    }

    proto = Object.getPrototypeOf(proto);
  }

  return endpoints;
}

export abstract class Controller implements EndpointProvider {
  getEndpoints(): Endpoint[] {
    const constructor = this.constructor as Constructor<this>;
    const endpointMetadata = getControllerEndpointMetadata(constructor);

    return endpointMetadata.map((metadata) => {
      const method = this[metadata.classMethodName as keyof this];

      if (typeof method !== 'function') {
        throw new Error(
          `Handler "${metadata.classMethodName}" is not a function in ${constructor.name}`,
        );
      }

      return createEndpoint(metadata, method.bind(this));
    }) as Endpoint[];
  }
}
