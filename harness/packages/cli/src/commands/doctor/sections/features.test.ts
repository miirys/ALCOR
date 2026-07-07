import { describe, expect, it } from '@jest/globals';
import { CHECKS_PER_FEATURE, type Feature, type FeatureState } from '@gitlab-org/core';
import { EXCLUDED_FEATURES, FEATURE_TITLES, renderFeatures } from './features';

const ALL_FEATURES = Object.keys(CHECKS_PER_FEATURE) as Feature[];

describe('FEATURE_TITLES', () => {
  // If this fails, a new Feature has been added in @gitlab-org/core. Decide
  // whether it belongs in the diagnostics report: add it to FEATURE_TITLES
  // (included) or EXCLUDED_FEATURES (intentionally omitted).
  it('covers every Feature via the allowlist or the explicit exclusion list', () => {
    const accounted = new Set<Feature>([
      ...(Object.keys(FEATURE_TITLES) as Feature[]),
      ...EXCLUDED_FEATURES,
    ]);
    expect([...accounted].sort()).toEqual([...ALL_FEATURES].sort());
  });
});

describe('renderFeatures', () => {
  const stateFor = (featureId: Feature): FeatureState => ({
    featureId,
    engagedChecks: [],
    allChecks: [],
  });

  it('renders a section for every allowlisted feature and omits the rest', () => {
    const output = renderFeatures(ALL_FEATURES.map(stateFor));

    for (const title of Object.values(FEATURE_TITLES)) {
      expect(output).toContain(`### ${title}`);
    }
    for (const featureId of EXCLUDED_FEATURES) {
      expect(output).not.toContain(featureId);
    }
  });

  it('falls back to a placeholder when no features are visible', () => {
    expect(renderFeatures(EXCLUDED_FEATURES.map(stateFor))).toContain(
      '_No feature checks available._',
    );
  });
});
