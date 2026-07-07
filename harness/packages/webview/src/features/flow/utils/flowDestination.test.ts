import { describe, it, expect } from 'vitest';
import type { CatalogFlowSummary } from '../types';
import { getFlowDestination } from './flowDestination';

function makeSummary(overrides: Partial<CatalogFlowSummary> = {}): CatalogFlowSummary {
  return {
    uri: 'gitlab-catalog://flow/42',
    id: 'gid://gitlab/Ai::Catalog::Item/42',
    name: 'My Catalog Flow',
    description: '',
    public: false,
    updatedAt: '2025-01-01T00:00:00Z',
    projectFullPath: 'group/proj',
    latestVersionName: '1.0.0',
    ...overrides,
  };
}

describe('getFlowDestination', () => {
  describe('file flows', () => {
    it('parses flow:// URIs to a friendly label', () => {
      const result = getFlowDestination('flow://default', null);
      expect(result.kind).toBe('file');
      expect(result.label).toBe('default');
      expect(result.tooltip).toBe('Save to local file: default.yml');
    });

    it('handles flow:// with a custom name', () => {
      const result = getFlowDestination('flow://my-cool-flow', null);
      expect(result.label).toBe('my-cool-flow');
    });

    it('strips .yml from file:// URIs', () => {
      const result = getFlowDestination('file:///tmp/foo.yml', null);
      expect(result.kind).toBe('file');
      expect(result.label).toBe('foo');
    });

    it('strips .yaml from file:// URIs', () => {
      const result = getFlowDestination('file:///tmp/bar.yaml', null);
      expect(result.label).toBe('bar');
    });

    it('falls back to "default" when flow:// has no host', () => {
      const result = getFlowDestination('flow://', null);
      expect(result.label).toBe('default');
    });
  });

  describe('catalog flows', () => {
    it('uses the summary name when available', () => {
      const result = getFlowDestination(
        'gitlab-catalog://flow/42',
        makeSummary({ name: 'Resolve SAST' }),
      );
      if (result.kind !== 'catalog') throw new Error('expected catalog destination');
      expect(result.label).toBe('Resolve SAST');
      expect(result.projectPath).toBe('group/proj');
      expect(result.tooltip).toContain('AI Catalog');
      expect(result.tooltip).toContain('Resolve SAST');
      expect(result.tooltip).toContain('group/proj');
    });

    it('falls back to the catalog id when no summary name is known', () => {
      const result = getFlowDestination('gitlab-catalog://flow/7', null);
      expect(result.label).toBe('Catalog item #7');
    });

    it('falls back to the catalog id when nothing else is known', () => {
      const result = getFlowDestination('gitlab-catalog://flow/99', null);
      expect(result.label).toBe('Catalog item #99');
    });

    it('keeps projectPath null when summary lacks one', () => {
      const result = getFlowDestination(
        'gitlab-catalog://flow/1',
        makeSummary({ projectFullPath: null }),
      );
      if (result.kind !== 'catalog') throw new Error('expected catalog destination');
      expect(result.projectPath).toBeNull();
    });

    it('handles a null summary gracefully', () => {
      const result = getFlowDestination('gitlab-catalog://flow/3', makeSummary());
      expect(result.kind).toBe('catalog');
    });
  });
});
