import { Feature, FeatureState } from '@gitlab-org/core';
import { ClientConfig } from '@gitlab-org/config';

export interface ConfigurationValidator {
  feature: Feature;
  validate(config: ClientConfig): Promise<FeatureState>;
}
