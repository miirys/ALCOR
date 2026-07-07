import type { ZodIssue } from 'zod';
import type { NodeId } from '../../../utils/node';
import { FlowValidationCode } from '../../../validation/codes';
import type { FlowValidationIssue } from '../../../validation/types';
import type { FlowV1 } from './schema';

/**
 * Map ZodIssues produced when validating a generated/loaded v1 flow into the
 * unified {@link FlowValidationIssue} shape.
 *
 * Responsibilities:
 *  - Route issues to a source node when the v1 path identifies one
 *    (`components[N].*` via name lookup; `prompts[N].*` via prompt_id match;
 *    `routers[N].*` via the router's `from` name).
 *  - Translate the v1 field path (snake_case + numeric segments) to the
 *    internal path vocabulary (camelCase + bracket-notation indices).
 *
 * Routing is best-effort: when no nodeId can be derived, the issue is
 * emitted flow-level and the path is translated but kept relative to the
 * v1 root.
 *
 * @param zodIssues  Issues from `FlowV1Schema.safeParse(...).error.issues`.
 * @param flowV1     The v1 data that failed parsing. May be undefined when
 *                   the failure originated from `toFlow` (we have no parsed
 *                   data to walk in that case).
 * @param nameToId   Lookup from v1 component name → internal NodeId. Only
 *                   meaningful for `fromFlow`, where the converter built it
 *                   from internal labels. Omit for `toFlow`.
 */
export function mapZodIssuesToValidationIssues(
  zodIssues: readonly ZodIssue[],
  flowV1: FlowV1 | undefined,
  nameToId: Map<string, NodeId> | undefined,
): FlowValidationIssue[] {
  return zodIssues.map((issue) => zodIssueToValidationIssue(issue, flowV1, nameToId));
}

function zodIssueToValidationIssue(
  issue: ZodIssue,
  flowV1: FlowV1 | undefined,
  nameToId: Map<string, NodeId> | undefined,
): FlowValidationIssue {
  // ZodIssue.path is typed as PropertyKey[] but in practice only contains
  // strings and numbers for the FlowV1Schema (no symbols).
  const path = issue.path.filter(
    (segment): segment is string | number =>
      typeof segment === 'string' || typeof segment === 'number',
  );
  const route = routeIssue(path, flowV1, nameToId);

  return {
    severity: 'error',
    code: FlowValidationCode.Schema,
    message: issue.message,
    ...(route.nodeId !== undefined ? { nodeId: route.nodeId } : {}),
    ...(route.fieldPath ? { fieldPath: route.fieldPath } : {}),
  };
}

interface RouteResult {
  nodeId?: NodeId;
  fieldPath?: string;
}

/**
 * Inspect the v1 path and decide (a) which node owns the issue, if any, and
 * (b) what internal-vocabulary field path to attach. The translation is
 * mechanical: numeric segments become bracket-notation, snake_case becomes
 * camelCase. Nonstructural mappings (v1 `inputs` vs internal
 * `parameterBindings`, routers vs edges) are accepted as best-effort —
 * Phase 4's scroll-to-field is responsible for handling paths that don't
 * resolve cleanly.
 */
function routeIssue(
  path: (string | number)[],
  flowV1: FlowV1 | undefined,
  nameToId: Map<string, NodeId> | undefined,
): RouteResult {
  if (path.length === 0) return {};

  const [root, ...rest] = path;

  if (root === 'components' && typeof rest[0] === 'number') {
    const index = rest[0];
    const componentName = flowV1?.components[index]?.name;
    const nodeId = componentName && nameToId?.get(componentName);
    const subPath = rest.slice(1);
    return {
      ...(nodeId ? { nodeId } : {}),
      ...(subPath.length > 0 ? { fieldPath: formatPath(subPath) } : {}),
    };
  }

  if (root === 'prompts' && typeof rest[0] === 'number') {
    const index = rest[0];
    const prompt = flowV1?.prompts?.[index];
    const ownerComponent = prompt
      ? flowV1?.components.find((c) => 'prompt_id' in c && c.prompt_id === prompt.prompt_id)
      : undefined;
    const nodeId = ownerComponent?.name ? nameToId?.get(ownerComponent.name) : undefined;
    // When we can route to the owning node, express the path relative to
    // that node's config (`localPrompt.promptTemplate.user`). Otherwise
    // keep it under the top-level `prompts[N]` root.
    const subPath = rest.slice(1);
    if (nodeId) {
      return {
        nodeId,
        fieldPath: formatPath(['localPrompt', ...subPath]),
      };
    }
    return { fieldPath: formatPath(path) };
  }

  if (root === 'routers' && typeof rest[0] === 'number') {
    const index = rest[0];
    const router = flowV1?.routers[index];
    const sourceName = router?.from;
    const nodeId = sourceName && sourceName !== 'end' ? nameToId?.get(sourceName) : undefined;
    return {
      ...(nodeId ? { nodeId } : {}),
      fieldPath: formatPath(path),
    };
  }

  // flow.entry_point, flow.inputs[N].input_schema.foo, version, environment, …
  return { fieldPath: formatPath(path) };
}

/**
 * Translate a Zod path into an internal-vocabulary field path:
 *   ['components', 0, 'prompt_template', 'user']
 *     → 'components[0].promptTemplate.user'
 */
function formatPath(path: (string | number)[]): string {
  let out = '';
  path.forEach((segment, index) => {
    if (typeof segment === 'number') {
      out += `[${segment}]`;
    } else {
      const camel = snakeToCamel(segment);
      // First string segment never gets a leading dot; numeric segments
      // always use bracket notation regardless of position. All current
      // call-sites pass paths whose first segment is a string.
      out += index === 0 ? camel : `.${camel}`;
    }
  });
  return out;
}

function snakeToCamel(value: string): string {
  return value.replace(/_([a-z])/g, (_, ch: string) => ch.toUpperCase());
}
