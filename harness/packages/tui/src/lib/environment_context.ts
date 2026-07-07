import { createContext } from 'react';
import type { Theme } from './theme';

export const DUO_CLI_DISTRIBUTIONS = ['glab', 'npm', 'binary', 'unknown'] as const;
export type DuoCliDistribution = (typeof DUO_CLI_DISTRIBUTIONS)[number];

export const isGlab = () => process.env.GITLAB_DUO_DISTRIBUTION === 'glab';

export const GLAB_DUO_APP_NAME = 'glab duo cli';
export const DUO_APP_NAME = 'duox';
export const getAppName = () => (isGlab() ? GLAB_DUO_APP_NAME : DUO_APP_NAME);

export interface EnvInfo {
  terminalName: string;
  isKittyProtocolSupported: boolean;
  duoCliVersion: string;
  environment: EnvironmentLabel;
  distribution: DuoCliDistribution;
  osPlatform: string;
  osVersion: string;
  theme: Theme;
  shell?: string;
}

export type EnvironmentLabel = 'development' | 'production';

export const EnvironmentContext = createContext<EnvInfo>({
  terminalName: 'unknown',
  isKittyProtocolSupported: false,
  duoCliVersion: 'unknown',
  environment: 'development',
  distribution: 'unknown',
  osPlatform: 'unknown',
  osVersion: 'unknown',
  theme: 'dark',
  shell: undefined,
});
