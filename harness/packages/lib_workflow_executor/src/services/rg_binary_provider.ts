import { createInterfaceId } from '@gitlab/needle';

/**
 * A string token representing the path to the embedded rg binary.
 * Each binary (CLI, LS) registers this in DI by importing from its own
 * auto-generated shim (rg_binary_embed.ts).
 */
export const RgEmbeddedBinaryPath = createInterfaceId<string>('RgEmbeddedBinaryPath');

export interface RgBinaryProvider {
  getPath(): Promise<string | null>;
}
export const RgBinaryProvider = createInterfaceId<RgBinaryProvider>('RgBinaryProvider');
