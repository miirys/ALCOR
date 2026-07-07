import { isCatalogFlowUri, parseCatalogFlowUri } from '@gitlab-org/flow-builder/flow';
import type { CatalogFlowSummary } from '../types';

/**
 * Where the current in-memory flow is bound to be saved. Drives the
 * destination indicator next to the workflow action bar so the user can
 * tell at a glance whether Save will write to a local file or push to
 * the AI Catalog (.com).
 */
export type FlowDestination =
  | {
      kind: 'file';
      label: string;
      tooltip: string;
    }
  | {
      kind: 'catalog';
      label: string;
      tooltip: string;
      projectPath: string | null;
    };

const FLOW_URI_PREFIX = 'flow://';

function fileLabelFromUri(uri: string): string {
  if (uri.startsWith(FLOW_URI_PREFIX)) {
    const name = uri.slice(FLOW_URI_PREFIX.length);
    return name || 'default';
  }
  if (uri.startsWith('file://')) {
    try {
      const url = new URL(uri);
      const segments = url.pathname.split('/').filter(Boolean);
      const last = segments[segments.length - 1];
      return last ? last.replace(/\.ya?ml$/i, '') : 'flow';
    } catch {
      /* fall through */
    }
  }
  return uri;
}

/**
 * Derive the destination metadata for the current URI/flow.
 *
 * `summary` is preferred when present (set when the user picks or creates
 * a catalog flow); otherwise we fall back to the loaded flow's metadata
 * and finally to the URI itself.
 */
export function getFlowDestination(
  uri: string,
  summary: CatalogFlowSummary | null,
): FlowDestination {
  if (isCatalogFlowUri(uri)) {
    const catalogId = parseCatalogFlowUri(uri);
    const name = summary?.name?.trim() || '';
    const label = name || (catalogId ? `Catalog item #${catalogId}` : 'AI Catalog flow');
    const projectPath = summary?.projectFullPath ?? null;
    const tooltipParts = ['Save to AI Catalog'];
    if (name) tooltipParts.push(name);
    if (projectPath) tooltipParts.push(`(${projectPath})`);
    return {
      kind: 'catalog',
      label,
      tooltip: tooltipParts.join(' '),
      projectPath,
    };
  }

  const label = fileLabelFromUri(uri);
  return {
    kind: 'file',
    label,
    tooltip: `Save to local file: ${label}.yml`,
  };
}
