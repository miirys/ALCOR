import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import { RgBinaryProvider } from './rg_binary_provider';

/**
 * No-op provider used when no embedded binary is available (dev/npm mode).
 * The CLI and LS binaries override this with DefaultRgBinaryProvider.
 */
@Service({
  dependencies: [],
  lifetime: ServiceLifetime.Singleton,
})
@Implements(RgBinaryProvider)
export class NullRgBinaryProvider implements RgBinaryProvider {
  async getPath(): Promise<string | null> {
    return null;
  }
}
