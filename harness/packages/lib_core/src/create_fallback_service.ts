import { Logger } from '@gitlab-org/logging';
import { sortBy } from 'lodash-es';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AsyncFunction<T = unknown> = (...args: any[]) => Promise<T>;

/**
 * Generic utility function that tries a sequence of async functions in order
 * and returns the first successful result or throws the last error
 * @param logger Logger object for showing errors of previous fallbacks while debugging.
 * @param fns Array of async functions to try
 * @param args Arguments to pass to each function
 * @returns Result from the first successful function
 * @throws Last error encountered if all functions fail
 */
export function createFallbackFn<T, F extends AsyncFunction<T>>(logger: Logger, fns: F[]) {
  if (fns.length === 0) {
    throw new Error('No functions provided');
  }

  return async (...args: Parameters<F>) => {
    let lastError: Error | null = null;
    for (const fn of fns) {
      try {
        // eslint-disable-next-line no-await-in-loop
        return await fn(...args);
      } catch (error) {
        logger.debug(
          `failed to call function ${fn?.name ?? 'unknown'}, will try to fall back: ${error instanceof Error ? error.message : String(error)}`,
        );
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    throw lastError || new Error('All functions failed');
  };
}

type PickMatching<T, V> = { [K in keyof T as T[K] extends V ? K : never]: T[K] };
type Methods<T> = PickMatching<T, AsyncFunction>;
type MethodNames<T> = keyof Methods<T>;

export type BareService<T, M extends MethodNames<T> = MethodNames<T>> = Pick<Methods<T>, M>;
export type Service<T, M extends MethodNames<T>> = { priority: number } & BareService<T, M>;

/**
 * Take a list of services that implement an identical interface and return an
 * object with methods that iterate over the service options, returning the first
 * success or throwing the last failure.
 * @param logger Logger object for showing errors of previous fallbacks while debugging.
 * @param services Array of services to merge into fallback service
 * @returns Service object of all services merged together
 */
export function createFallbackService<T, M extends MethodNames<T> = MethodNames<T>>(
  logger: Logger,
  services: Service<T, M>[],
): BareService<T, M> {
  if (services.length === 0) {
    throw new Error('No services provided');
  }

  const sortedServices = sortBy(services, (s) => s.priority).reverse();

  const serviceProxy = {} as Service<T, M>;

  const getAllPropertyNames = (obj: unknown): string[] => {
    const props = new Set<string>();
    const builtInPrototypes = [
      Object.prototype,
      Array.prototype,
      Function.prototype,
      Number.prototype,
      String.prototype,
      Boolean.prototype,
      Date.prototype,
      RegExp.prototype,
      Error.prototype,
    ];

    let current = obj;
    while (current && !builtInPrototypes.includes(current)) {
      Object.getOwnPropertyNames(current).forEach((name) => props.add(name));
      current = Object.getPrototypeOf(current);
    }

    return Array.from(props);
  };

  const firstService = services[0];
  if (!firstService) {
    throw new Error('No services provided');
  }
  const propertyNames = getAllPropertyNames(firstService) as (keyof Service<T, M>)[];
  const functionNames = propertyNames.filter((p) => typeof firstService[p] === 'function') as M[];

  functionNames.forEach((method) => {
    serviceProxy[method] = createFallbackFn(
      logger,
      sortedServices.map((s) => (s[method] as AsyncFunction).bind(s)),
    ) as Service<T, M>[typeof method];
  });

  return serviceProxy;
}
