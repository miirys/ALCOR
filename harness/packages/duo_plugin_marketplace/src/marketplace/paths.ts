import { join } from 'node:path';
import { getDuoConfigDir } from '@gitlab-org/ai-configuration';

function duoConfigDir(): string {
  const dir = getDuoConfigDir();
  if (!dir) {
    throw new Error('Unable to resolve the Duo config directory.');
  }
  return dir;
}

/** `<duoConfigDir>/known_marketplaces.json` — the local registry of added marketplaces. */
export function getKnownMarketplacesFilePath(): string {
  return join(duoConfigDir(), 'known_marketplaces.json');
}

/** `<duoConfigDir>/marketplaces` — the directory holding cloned/copied catalogs. */
export function getMarketplacesDir(): string {
  return join(duoConfigDir(), 'marketplaces');
}

/** `<duoConfigDir>/marketplaces/<name>` — a marketplace's install location on disk. */
export function getInstallLocation(name: string): string {
  return join(getMarketplacesDir(), name);
}
