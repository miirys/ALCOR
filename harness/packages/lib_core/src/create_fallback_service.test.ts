import { Logger } from '@gitlab-org/logging';
import { createFakePartial } from '@gitlab-org/test-utils';
import { createFallbackService } from './create_fallback_service';

interface TestService {
  methodA(): Promise<string>;
  methodB(): Promise<number>;
}

class TestServiceImpl implements TestService {
  priority: number;

  #name: string;

  #shouldFail: boolean;

  constructor(name: string, shouldFail = false, priority = 1) {
    this.#name = name;
    this.#shouldFail = shouldFail;
    this.priority = priority;
  }

  async methodA(): Promise<string> {
    if (this.#shouldFail) {
      throw new Error(`${this.#name} methodA failed`);
    }
    return `${this.#name} methodA result`;
  }

  async methodB(): Promise<number> {
    if (this.#shouldFail) {
      throw new Error(`${this.#name} methodB failed`);
    }
    return this.#name.length;
  }
}

describe('createFallbackService', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createFakePartial<Logger>({
      debug: jest.fn(),
    });
  });

  it('should work with class instances and call prototype methods', async () => {
    const service1 = new TestServiceImpl('service1', true, 1); // will fail
    const service2 = new TestServiceImpl('service2', false, 2); // will succeed

    const services = [service1, service2];

    const fallbackService = createFallbackService<TestService>(logger, services);

    // Test that prototype methods are available and work
    const resultA = await fallbackService.methodA();
    expect(resultA).toBe('service2 methodA result');

    const resultB = await fallbackService.methodB();
    expect(resultB).toBe(8); // 'service2'.length
  });

  it('should handle fallback correctly when first service fails', async () => {
    const service1 = new TestServiceImpl('failing', true, 2); // higher priority, will be tried first
    const service2 = new TestServiceImpl('working', false, 1);

    const services = [service1, service2];

    const fallbackService = createFallbackService<TestService>(logger, services);

    const result = await fallbackService.methodA();
    expect(result).toBe('working methodA result');
    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        'failed to call function bound methodA, will try to fall back: failing methodA failed',
      ),
    );
  });

  it('should throw last error when all services fail', async () => {
    const service1 = new TestServiceImpl('fail1', true, 1);
    const service2 = new TestServiceImpl('fail2', true, 2);

    const services = [service1, service2];

    const fallbackService = createFallbackService<TestService>(logger, services);

    await expect(fallbackService.methodA()).rejects.toThrow('fail1 methodA failed');
  });

  it('should work with complex inheritance hierarchy', async () => {
    class BaseService {
      priority = 1;

      async methodA(): Promise<string> {
        return 'from BaseService';
      }
    }

    class ExtendedService extends BaseService implements TestService {
      async methodB(): Promise<number> {
        return 42; // This should not be called due to priority
      }
    }

    const serviceA = new ExtendedService();
    const serviceB = new ExtendedService();
    serviceB.priority = 2;
    const services = [serviceA, serviceB];

    const fallbackService = createFallbackService<TestService>(logger, services);

    const resultA = await fallbackService.methodA();
    expect(resultA).toBe('from BaseService'); // From higher priority service

    const resultB = await fallbackService.methodB();
    expect(resultB).toBe(42); // From higher priority service
  });
});
