---
name: graphql
description: Use every time you touch a GraphQL query or mutation. Covers instance-version gating, the fallback contract (err vs unsupported), and supporting both GitLab.com (reports X.Y.0-pre) and older instances that lack the operation.
---

# GraphQL operations & version gating

Operations live in `packages/lib_graphql/src/operations/` and run through
`DefaultGraphQLService.execute` (`packages/lib_graphql/src/service.ts`). Each is a
`GraphQLOperation<Data>` (`packages/lib_graphql/src/types/index.ts`):

```ts
export interface GraphQLOperation<Data> {
  fallback: (event: FallbackEvent) => Data;
  supportedSinceInstanceVersion?: string; // e.g. '19.2.0'
  query: string;
}
export interface FallbackEvent {
  err?: unknown;
  unsupported?: 'future_field' | 'removed_field';
}
```

Register named operations in `KnownGraphQLOperations`
(`packages/lib_graphql/src/operations/index.ts`) so callers invoke them by
`operationName`.

## Gating & the fallback contract

`execute` checks the instance version **before sending anything**, so `fallback`
runs in two distinct cases that `FallbackEvent` distinguishes:

```ts
if (!this.#laterVersion(supportedSinceInstanceVersion)) {
  return fallback({ unsupported: 'future_field' }); // too old → request NEVER sent
}
try {
  return await this.#api.fetchFromApi(...);
} catch (err) {
  return fallback({ err });                          // request sent, then failed
}
```

- `event.unsupported` — instance older than the gate; the operation never ran (no
  server error). Return a graceful **no-op** result.
- `event.err` — supported instance, request failed. Treat as a real failure.

```ts
fallback: (event) => {
  if (event.err) throw new Error(`Error doing X: ${event.err}`, { cause: event.err });
  return /* no-op, e.g. { ...: { errors: [] } } */; // only reached for `unsupported`
},
```

**Do not return an error payload for `unsupported`.** Mutations often return
`{ errors: string[] }` and callers do `if (errors.length > 0) throw`. Returning
`errors: ['Failed…']` when the instance is simply too old turns "not available
here" into a hard failure. Return `errors: []` so the feature degrades gracefully.

## GitLab.com vs older instances

- **GitLab.com** deploys from `master`, ahead of releases, and reports e.g.
  `19.2.0-pre`. `coerce()` (`packages/lib_core/src/utils/if_version_gte.ts`)
  strips `-pre` → `19.2.0`, so the gate treats it as the upcoming milestone. Check
  the live value with `glab api version` (`.version`).
- **Older self-managed instances** report a real release (e.g. `19.1.3-ee`) and
  hit the `unsupported` no-op.

Set `supportedSinceInstanceVersion` to the milestone the **server-side (monolith /
AI Gateway) MR merged into**, `.0` patch — verify, don't guess:

```bash
glab api projects/gitlab-org%2Fgitlab/merge_requests/<iid> \
  | python3 -c "import sys,json;d=json.load(sys.stdin);print((d.get('milestone') or {}).get('title'),d['merged_at'])"
```

**`-pre` caveat:** because `coerce` drops `-pre`, the gate opens on GitLab.com for
the *whole* dev cycle of that milestone — including before the server MR deploys.
In that window GitLab.com sends the request and it fails (`event.err`). So never
gate to a milestone whose server side hasn't merged + deployed yet.

## Testing

Drive `DefaultGraphQLService` with a fake `GitLabApiService` whose
`instanceInfo.instanceVersion` you control (see
`packages/lib_graphql/src/operations/ai/*.test.ts`): supported + success,
supported + `fetchFromApi` rejects (fallback throws), and older version (no-op,
assert `fetchFromApi` was **not** called).
