# Feature State Management Proposal

The status of the client feature is determined by multiple conditions - user actions, license availability, GitLab instance version, etc. Language Server will be responsible for determining the state of the feature based on the information received from the Client.

## Features

1. Authentication
1. Code Suggestions
1. Chat
1. Workflow Features (Upcoming, not implemented)
1. Others

## State Checks

Each state check is responsible for checking one condition that determines the availability of the Client features. The `StateCheck` engages when the check for the condition fails. For example `Code Suggestions Availability` state check will make an API call to request Code Suggestions license for the user and will engage if license is not available.

## Feature State Manager

Feature State Manager when notified about the Client side changes such as:

1. Account change
1. Project change
1. Document open, close, change events
1. Document in active editor change

State manager will run the State Checks to determine which State checks are engaged. State Manager will notify the Client about the engaged checks and additional context (if available).

## Communication

Client should notify the Server about the changes that influence feature availability sending the LSP notification:

1. `workspace/didChangeConfiguration` with `token` and `baseUrl` that will notify about account change.
1. `workspace/didChangeWorkspaceFolders` that will be used by the LS to detect active projects
1. Document synchronization events `textDocument/didOpen`, `textDocument/didClose`, `textDocument/didChange` that will be used by the LS to track active documents
1. Custom `$/gitlab/didChangeDocumentInActiveEditor` with `TextDocument` or its `URI` in a payload to notify about the document change in the active editor.

Server will respond about the engaged checks sending custom `$/gitlab/featureStateChange` of the `FeatureStateChangePayload` type:

Please, refer to the [implementation](../../packages/lib_core/src/feature_state_management/types.ts) to see the current supported checks. The following section reflects initial implementation and is a subject to change:

```typescript
export type Feature =
  | typeof AUTHENTICATION
  | typeof CODE_SUGGESTIONS
  | typeof CHAT
  | typeof WORKFLOW
  | typeof SANDBOX;

type FeatureStateChangePayload = FeatureState[];

export interface FeatureState {
  featureId: Feature;
  // @deprecated this prop is deprecated. Use `allChecks` instead
  engagedChecks: FeatureStateCheck<StateCheckId>[];
  allChecks: FeatureStateCheck<StateCheckId>[];
}

export interface FeatureStateCheck<T extends StateCheckId> {
  checkId: T;
  details?: string;
  context?: StateCheckContext<T>;
}

export const AUTHENTICATION_REQUIRED = 'authentication-required' as const;
export const INVALID_TOKEN = 'invalid-token' as const;
export const SUGGESTIONS_NO_LICENSE = 'code-suggestions-no-license' as const;
export const CHAT_NO_LICENSE = 'chat-no-license' as const;
export const DUO_DISABLED_FOR_PROJECT = 'duo-disabled-for-project' as const;
export const UNSUPPORTED_GITLAB_VERSION = 'code-suggestions-unsupported-gitlab-version' as const;
export const UNSUPPORTED_LANGUAGE = 'code-suggestions-document-unsupported-language' as const;
export const DISABLED_LANGUAGE = 'code-suggestions-document-disabled-language' as const;
export const SUGGESTIONS_API_ERROR = 'code-suggestions-api-error' as const;
export const SUGGESTIONS_DISABLED_BY_USER = 'code-suggestions-disabled-by-user' as const;
export const CHAT_DISABLED_BY_USER = 'chat-disabled-by-user' as const;
export const SANDBOX_DISABLED_BY_USER = 'sandbox-disabled-by-user' as const;
export const SANDBOX_UNSUPPORTED_PLATFORM = 'sandbox-unsupported-platform' as const;
export const SANDBOX_MISSING_DEPENDENCIES = 'sandbox-missing-dependencies' as const;

export type StateCheckId =
  | typeof AUTHENTICATION_REQUIRED
  | typeof INVALID_TOKEN
  | typeof SUGGESTIONS_NO_LICENSE
  | typeof CHAT_NO_LICENSE
  | typeof DUO_DISABLED_FOR_PROJECT
  | typeof UNSUPPORTED_GITLAB_VERSION
  | typeof UNSUPPORTED_LANGUAGE
  | typeof SUGGESTIONS_API_ERROR
  | typeof DISABLED_LANGUAGE
  | typeof SUGGESTIONS_DISABLED_BY_USER
  | typeof CHAT_DISABLED_BY_USER
  | typeof SANDBOX_DISABLED_BY_USER
  | typeof SANDBOX_UNSUPPORTED_PLATFORM
  | typeof SANDBOX_MISSING_DEPENDENCIES;
```

The `SANDBOX_UNSUPPORTED_PLATFORM` and `SANDBOX_MISSING_DEPENDENCIES` checks
attach a `context` payload so IDEs can render actionable diagnostics
(platform, missing system packages, sandbox runtime version). The `context`
is emitted on all checks — engaged or not — so IDEs can always read the
detected platform and runtime version from `allChecks`.

When the feature checks are engaged, the `allChecks` will contain the identifiers of all engaged State Checks sorted from the highest to lowest priority. Thus the client can update the Feature Status Icon using the first engaged State Check and use the rest for the "Health Status Check", for example.
