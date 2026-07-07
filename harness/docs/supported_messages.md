<!-- markdownlint-disable MD013 -->

# Supported messages

This documentation describes each of the messages that is used in the current LSP
communication. Each of these messages is grouped under the specific category
defined by the LSP specification, and has both the name of the LSP method and a link
to the specification. Also:

- Each message is clearly identified as required or optional.
- int to specify the origin and destination of the message.
Client &rarr; Server indicates that the Client sends the message and the Server
listens/subscribes to it. Conversely, Server &rarr; Client indicates that the
Server sends the message and the Client listens to it. When the message is marked
as `Required` and the direction of the communication is Client &rarr; Server, the
Client must send the message to the Server. If the direction is Server &rarr;
Client, the Client must subscribe to the message from the Server.

[[_TOC_]]

_**Disclaimer**:
All the code snippets below are for the LSP Client which is a VS Code extension.
That Client uses `vscode-languageclient` and `vscode-languageserver` libraries
that implement the LSP protocol. Your Client's library might or might not have a
similar API. Use the code snippets just as a reference._

## Lifecycle messages

### Initialize

_**LSP method**: `initialize`_ | _**Required**: `yes`_ | _**Message direction**: Client &rarr; Server_ | _**Specification**: [link to specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#initialize)_

Initialization is the point in the application lifecycle where the Server:

- announces its capabilities to the Client
- gets the Client Information to be tracked with GitLab telemetry
- sends test connection message to the Client

#### Server and client capabilities

The Server returns its
[capabilities](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#serverCapabilities),
specifically that:

- It can provide code completion suggestions to the Client. [More information](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#completionOptions).
- It can provide inline code completion suggestions to the Client. [More information](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/#textDocument_inlineCompletion).
- It can synchronize text documents with the Client using the "Full" synchronization mode. [More information](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocumentSyncOptions).

#### Client information

On the initialization, the Client can send information about itself in the `clientInfo`
property of the `InitializeParams`.

```typescript
import { InitializeParams } from 'vscode-languageserver';

const ClientInfo: InitializeParams.clientInfo = {
  name: 'VSCode',
  version: '1.81.1',
};
```

This information is used for GitLab telemetry and send in the request header
with each request to the GitLab API in the following format:

```http
 User-Agent: code-completions-language-server-experiment (VSCode:1.81.1)
```

#### Extension and IDE information

This information is used for GitLab Code Suggestions telemetry.
The GitLab Extensions should provide this information in the `ide` and `extension`
properties of the custom `InitializationOptions` of the
[`InitializeParams`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#initializeParams).
For other Clients, If the `ide` data is not set, the Server falls back to the
`clientInfo` for IDE values.
[Check test VSCode extension implementation](https://gitlab.com/shekharpatnaik/gitlab-lsp-test-extension/-/blob/main/client/src/extension.ts#L109).

```typescript
import { LanguageClientOptions } from 'vscode-languageclient/node';

const ClientOptions: LanguageClientOptions = {
  initializationOptions: {
    extension: {
      name: 'Test VS Code extension',
      version: '0.0.1',
    },
    ide: {
      name: 'VSCode',
      version: '1.81.1',
      vendor: 'Microsoft',
    },
  },
};
```

#### Test connection message

At this point, the Server also sends the
[ShowMessage Notification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#window_showMessage)
to the Client with a `Hello from the Server!` message. It was added for easier
testing to make sure that the connection was established - it will be removed before the release.

### Initialized

_**LSP method**: `initialized`_ | _**Required**: `yes`_ | _**Message direction**: Client &rarr; Server_ | _**Specification**: [link to specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#initialized)_

## Workspace features

### `DidChangeConfiguration`

_**LSP method**: `workspace/didChangeConfiguration`_ | _**Required**: `yes`_ | _**Message direction**: Client &rarr; Server_ | _**Specification**: [link to specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_didChangeConfiguration)_

The Server should get all the Client settings in the `settings` property of this
notification payload.

- **Token (PAT or OAuth)**: the Server uses the token to authorize with
  GitLab API. Code Suggestions functionality won't work until the token is provided.
- **Token Type**: an optional hint (`'pat'` or `'oauth'`) indicating the type of
  token provided. When set, the Server skips the unnecessary token validation call
  (e.g. only checks the PAT endpoint when `tokenType` is `'pat'`). If not provided,
  the Server checks both endpoints.
- **Base URL**: the Code completion request call is made to the specific
  instance when `baseURL` is provided and its version is starting from `16.3.0`.
  Otherwise, the code completion request is made to `https://gitab.com`.
- **Project Path**: the full path to the project in GitLab for example `gitlab-org/gitlab`.
- **Telemetry**: the Client can enable/disable the telemetry on the Server side
  and set a custom `trackingUrl` of the Snowplow instance.
- **Secrets redaction**: The Secrets redaction feature is enabled by default but
  the Client can opt-out by setting the `enableSecretRedaction` flag to `false`
- **Disabled supported languages:** Disable Code Suggestions for the given array of
  [language identifiers](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocumentItem).
- **Additional languages:** To expand the list of [officially supported languages](https://docs.gitlab.com/user/project/repository/code_suggestions/supported_extensions/#supported-languages-by-ide) for Code Suggestions, provide an array of the [language identifiers](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocumentItem).
- **Streaming**: The Streaming feature is disabled by default. The Client can opt-in
  by setting the `streamCodeGenerations` feature flag to `true`.
- **Log level**: The Server can filter its output logging according to the log level
  provided by the Client. The allowed values are `debug`, `info`, `warning`, and `error`.
  If a level is not provided, the Server will default to `"info"`.
- **Ignore certificate errors**: Whether to ignore TLS/SSL certificate errors for HTTPS
  communication. This is not recommended for general use but can be helpful in debugging
  errors related to errors communicating over HTTPS connections (typically due to proxy
  usage).

  > [!note]
  > This is not applicable to the browser build which uses the built-in `fetch` function.

- **HTTP agent options**: Whether to ignore TLS/SSL certificate errors for HTTPS
  - **ca**: Deprecated. Please see the [SSL setup guide (VSCode)](https://docs.gitlab.com/editor_extensions/visual_studio_code/ssl/) for more information on how to set up your self-signed CA.
  - **cert**: Unsupported - See [&6244](https://gitlab.com/groups/gitlab-org/-/epics/6244). If your GitLab Self-Managed or GitLab Dedicated instance requires a custom cert/key pair you would probably need to set this option in to point your certificate file. Please also see `certKey` option.
  - **certKey**: Unsupported - See [&6244](https://gitlab.com/groups/gitlab-org/-/epics/6244). If your GitLab Self-Managed or GitLab Dedicated instance requires a custom cert/key pair you would probably need to set this option in to point your certificate key file. Please also see `cert` ption.

- **Security scan options**: Security scans are disabled by default. The Client
  can opt-in by setting the `remoteSecurityScans` feature flag to `true`.

  > [!note]
  > Source text is sent unmodified to the GitLab instance, without [secret reduction](#secret-reduction).

The Client should send the `DidChangeConfiguration` notification with the settings
on startup and every time this data is updated on the Client side.
View how the test VSCode extension
[implements sending this data](https://gitlab.com/shekharpatnaik/gitlab-lsp-test-extension/-/blob/main/client/src/extension.ts#L186).

```typescript
const sampleChangeConfigObject = {
  settings: {
    token: 'glpat',
    tokenType: 'pat',
    baseUrl: 'https://gitlab.com',
    ignoreCertificateErrors: false,
    httpAgentOptions: {
      ca: '',
      cert: '',
      certKey: '',
    },
    projectPath: 'gitlab-org/gitlab',
    codeCompletion: {
      enableSecretRedaction: false,
      disabledSupportedLanguages: ['java'],
      additionalLanguages: ['html, css']
    },
    telemetry: {
      enabled: true,
      trackingUrl: 'http://127.0.0.1:9091'
    },
    logLevel: 'info',
    featureFlags: {
      streamCodeGenerations: true,
      remoteSecurityScans: true
    },
    securityScannerOptions: {
      enabled: true,
    },
  },
};
```

### `DidChangeWorkspaceFolders`

_**LSP method**: `workspace/didChangeWorkspaceFolders`_ | _**Required**: `yes`_ | _**Message direction**: Client &rarr; Server_ | _**Specification**: [link to specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#workspace_didChangeWorkspaceFolders)_

The Server tries to detect the relative path to the file that the code suggestions
are requested for relatively to one of the workspace folders.
Check how test VS Code extension [implements this notification](https://gitlab.com/shekharpatnaik/gitlab-lsp-test-extension/-/blob/main/client/src/extension.ts#L176)

## Language features

### Completion

_**LSP method**: `textDocument/completion`_ | _**Required**: `no`_ | _**Message direction**: Client &rarr; Server_ | _**Specification**: [link to specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_completion)_

When the Client sends the Completion Request, the Server responds with the code suggestions. This message is marked as _not_ required because the client can choose between `completion` and `inlineCompletion`.

### Inline completion

_**LSP method**: `textDocument/inlineCompletion`_ | _**Required**: `no`_ | _**Message direction**: Client &rarr; Server_ | _**Specification**: [link to specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/#textDocument_inlineCompletion)_

When the Client sends the Completion Request, the Server responds with the code suggestions. This message is marked as _not_ required because the client can choose between `completion` and `inlineCompletion`.

## Document synchronization

> [!note]
> The Server is updated to publish diagnostics for the document on document synchronization events.
> The Client should send these notifications to the Server to receive the diagnostics in future.

### `DidOpenTextDocument`

_**LSP method**: `textDocument/didOpen`_ | _**Required**: `yes`_ | _**Message direction**: Client &rarr; Server_ | _**Specification**: [link to specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_didOpen)_

Supported language for Code Suggestions check is done when this notification is received from the Client. [See more about the code suggestions status check](#code-suggestions-status-check).

### `DidChangeTextDocument`

_**LSP method**: `textDocument/didChange`_ | _**Required**: `yes`_ | _**Message direction**: Client &rarr; Server_ | _**Specification**: [link to specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_didChange)_

### `DidClose`

_**LSP method**: `textDocument/didClose`_ | _**Required**: `yes`_ | _**Message direction**: Client &rarr; Server_ | _**Specification**: [link to specification](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#textDocument_didClose)_

## Custom messages

### Token validation

_**LSP method**: `$/gitlab/token/check`_ | _**Required**: `yes`_ | _**Message direction**: Server &rarr; Client_

When the Server receives the token in the payload of the `DidChangeConfiguration`
notification, it validates it sending request to GitLab API to check whether
the token is active and has enough scopes to make request to the Code suggestions API.
In case the token is invalid, the Server sends the `$/gitlab/token/check` message
to the Client with the following payload:

```typescript
export interface InvalidTokenResponse {
  reason?: 'unknown' | 'not_active' | 'invalid_scopes';
  message?: string;
}
```

`unknown` reason might indicate that the token check request was unsuccessful or
parsing the response failed. 2 others are self explanatory. The Client should
handle the token update and send a new token in the `DidChangeConfiguration`
notification. GitLab suggestions won't work if token is not active or does not
have enough scopes. View how the test VSCode extension
[implements handling this message](https://gitlab.com/shekharpatnaik/gitlab-lsp-test-extension/-/blob/main/client/src/extension.ts#L139).

### Open URL

_**LSP method**: `$/gitlab/openUrl`_ | _**Required**: `yes`_ | _**Message
direction**_: Server &rarr; Client_

When a URL is clicked in a webview implemented in the LSP, it sends this message
to the client along with the URL so the client may handle opening the URL in a
browser. Links in webviews will not work unless this notification is properly
handled.

### Telemetry

_**LSP method**: `$/gitlab/telemetry`_ | _**Required**: `no`_ | _**Message direction**: Client &rarr; Server_

Telemetry is enabled by default. To opt-out, the Client should set the `enable`
flag to `false` in the `telemetry` settings of the `DidChangeConfiguration`
notification payload.
[Check test VSCode extension implementation](https://gitlab.com/shekharpatnaik/gitlab-lsp-test-extension/-/blob/main/client/src/extension.ts#L195).

See [telemetry actions](telemetry.md) for more information about the actions supported and
when to send them.

#### Code suggestions telemetry

When telemetry is enabled, the Server tracks the
Code Suggestion lifecycle events. The Client should notify the Server whether the
code suggestion was accepted, rejected or cancelled by sending the telemetry
notification with the `category`, `action`, and a `trackingId` in the
payload. The unique `trackingId` is generated on the Server side and sent to the
Client in the `data` property of each
[`CompletionItem`](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#completionItem)
in the `onCompletion` response. View how the test VSCode extension
[implements handling this message](https://gitlab.com/shekharpatnaik/gitlab-lsp-test-extension/-/blob/main/client/src/extension.ts#L99).

```typescript
 client.sendNotification('$/gitlab/telemetry', {
  category: 'code_suggestions',
  action: 'suggestion_accepted', // or 'suggestion_rejected' or 'suggestion_cancelled
  context: {
    trackingId: suggestionTrackingId,
  },
});
```

Some telemetry events can be tracked both on the Client and Server side. For example,
the Client might be able to detect more precisely the moment when `suggestion_shown`
event happens. When it has this ability, it should notify the Server about it by
providing `actions` property of the telemetry configuration. This is called
registering to handle an action.
[View how the test VSCode extension implements this](https://gitlab.com/shekharpatnaik/gitlab-lsp-test-extension/-/blob/main/client/src/extension.ts#L196).

```typescript
  client.sendNotification(DidChangeConfigurationNotification.type, {
    settings: {
      telemetry: {
        actions: [
          { action: "suggestion_shown" },
        ]
      },
    }
  });
```

When the Server gets this configuration, it waits for the telemetry notification
with `action` set to `suggestion_shown` to track the telemetry event. Otherwise
the Server tracks the `suggestion_shown` event right before returning suggestions
to the Client.

### API health status

#### _**LSP method**: `$/gitlab/api/error`_ | _**Required**: `no`_ | _**Message direction**: Server &rarr; Client_

When the Code Suggestion endpoint responds with the error a couple times in a row, the Language Server uses Circuit Breaker pattern and pauses the requests for 10 seconds. It will notify the Clients with `$/gitlab/api/error` notification when this happens. The Clients can pause completion requests (but do not have to) or update UI to notify users why the Code Suggestions are not working.

#### _**LSP method**: `$/gitlab/api/recovery`_ | _**Required**: `no`_ | _**Message direction**: Server &rarr; Client_

When the Code Suggestions endpoint is healthy again, the Language Server will notify the Clients with the `$/gitlab/api/recovery` notification.

### Secret reduction

The Server removes secrets before
sending the code to the Code Suggestions Server, it replaces all the secrets
in the code with `*` based on the Gitleaks rules. The feature is enabled by default,
but the Client can disable it by toggling the flag in the settings as described
in the `DidChangeConfiguration` section above.

### Code Suggestions status check

#### _**LSP method**: `$/gitlab/didChangeDocumentInActiveEditor`_ | _**Required**: `yes`_ | _**Message direction**: Client &rarr; Server_

This notification is used additionally to the standard [`DidOpenTextDocument`](#didopentextdocument) notification to notify the Server about the active document change in the editor. The server performs the supported
language check on this notification as well as on the `DidOpenTextDocument`. The first parameter of this notification should be [`DocumentUri`](https://github.com/microsoft/vscode-languageserver-node/blob/f58f4dff16ad2760028bb1cb95e882de30a1000f/textDocument/src/main.ts#L10) or[`TextDocument`](https://github.com/microsoft/vscode-languageserver-node/blob/main/textDocument/src/main.ts#L120) (_this parameter type is deprecated_).

#### _**LSP method**: `$/gitlab/featureStateChange`_ | _**Required**: `yes`_ | _**Message direction**: Server &rarr; Client_

When the Server runs feature status check, it will notify the Client about the change with this notification.
In case when the feature is disabled, feature state change payload will contain non-empty array of checks that are engaged for the feature. To see more about the format of the data check [developer documentation for Feature State Management](../docs/developer/feature_state_management.md).

| Feature               | Check ID                                         | Explanation                                                                                                                                   |
|-----------------------|--------------------------------------------------|-----------------------------------------------------------------------------------------------------------------------------------------------|
| All                   | `authentication-required`                        | The user is unauthenticated.                                                                                                                  |
| Code Suggestions      | `code-suggestions-unsupported-gitlab-version`    | Code suggestions are not supported because GitLab instance version is lower than `16.8`.                                                      |
| Code Suggestions      | `code-suggestions-no-license`                    | User does not have active GitLab Duo license for code suggestions.                                                                                   |
| Code Suggestions/Chat | `duo-disabled-for-project`                       | GitLab Duo features are disabled for the current project.                                                                                            |
| Code Suggestions      | `code-suggestions-document-unsupported-language` | Code suggestions are not supported for the current document programming language.                                                             |
| Code Suggestions      | `code-suggestions-document-disabled-language`    | Code suggestions are disabled for the current document programming language due to user configuration, even though the language is supported. |
| Code Suggestions      | `code-suggestions-disabled-by-user`              | Code suggestions have been manually disabled by the user.                                                                                     |
| Chat                  | `chat-disabled-by-user`                          | Chat has been manually disabled by the user.                                                                                                  |
| Chat                  | `chat-no-license`                                | User does not have active GitLab Duo license for chat.                                                                                               |
| Code Suggestions/Chat | `undefined`                                      | Feature is active.                                                                                                                            |

When Code Suggestions feature has engaged checks, it should be communicated to the user and no requests for code suggestions should be sent to the Server. The client can use `details` and `context` [fields](../docs/developer/feature_state_management.md) to communicate the status to the user.

### Configuration validation

#### _**LSP method**: `$/gitlab/validateConfiguration`_ | _**Required**: `no`_ | _**Message direction**: Client &rarr; Server_

The Language Server supports requesting the validation of a configuration before it is saved.
This endpoint takes [ClientConfig](../packages/lib_config/src/config_service.ts#L113) as request and returns a list of features with their engaged checks based on the [Feature State Management](../docs/developer/feature_state_management.md) feature.
Feature state with no engaged checks in the response indicates that the feature is healthy for the given configuration.

### Security Scan

#### _**LSP method**: `$/gitlab/remoteSecurityScan`_ | _**Required**: `no`_ | _**Message direction**: Client &rarr;  Server_

This notification is used to trigger a security scan. The parameter of this notification should be [`DocumentUri`](https://github.com/microsoft/vscode-languageserver-node/blob/f58f4dff16ad2760028bb1cb95e882de30a1000f/textDocument/src/main.ts#L10).
