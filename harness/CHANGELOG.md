## [8.111.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.110.0...v8.111.0) (2026-07-03)

### ✨ Features

* **cli:** queue prompts submitted mid-turn ([1018cee](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1018cee26f9ad870a927bcca440e11c52065b3f5)) by James Casey
* **duo-agent-platform-v2:** implement tool approval and disclosure ([8d714af](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8d714afc685afd489589c217a1aefa64b26393e4)) by Mohammed Osumah
* **flow-builder:** drive canvas overlay from backend node-lifecycle events ([bb0b24a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/bb0b24aac4b355a9918451cd278d74086f4975bb)) by John Slaughter
* **ls:** make Duo file tools work outside git repositories ([f392bf8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f392bf8ad5a3998624d93524f87c5a4ae4c8c2ae)) by Malte Heuser
* **plugin-marketplace:** add marketplace ([e984b59](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e984b5903e503d17a2688fd628bae7a07e181948)) by Elwyn Benson
* **plugin-marketplace:** add safe plugin filesystem ([9a033e0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9a033e04ddf19cbb5e53f85b012460126a570ca2)) by Elwyn Benson
* **plugin-marketplace:** list marketplaces ([d938675](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d938675eb5610a17db2526f6e48a56fc1bf8ebb2)) by Elwyn Benson
* resolve symlinked skill directories ([0243e9b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0243e9be72bf6028f6c763d75ec69504b818a0b9)) by Erran Carey
* **telemetry:** populate user_id in gitlab_standard context ([194de66](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/194de661dce2e023882130d1598b872e6a2ff808)) by Laura Ionel
* **tui:** First-run welcome card in TUI ([8b591a7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8b591a739a66c6df0ef430767ebd98ebd2088117)) by Olena Horal-Koretska
* **tui:** hide build/plan mode switcher when a menu is open ([42eeed2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/42eeed2b1161d0319d05e281d20844b35358631a)) by Yi-Ann Chen

### 🐛 Bug Fixes

* **cli:** record slash-command input in prompt history before dispatch ([b485a44](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b485a449f8c4d0cf113612282ce145898f773feb)) by James Casey
* **cli:** skip available model lookup when rootNamespaceId is empty ([500ec37](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/500ec3791a94c1631b49e51b8f2120668c75f07e)) by Elwyn Benson
* **ls:** remove AgenticChatInstanceFlagCheck for removed feature flag ([9d3ba93](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9d3ba931258a24659b27357e26e5ebe7db2c647b)) by Igor Drozdov
* **ls:** surface skill formatting failures to users ([e876a20](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e876a20fbe6ee25be36b1c5efcff685d2034ff5b)) by Amr Elhusseiny
* **sandbox:** bump sandbox-runtime to 0.0.62 ([3e17519](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3e1751957c3de1cf0754f0b3018e4613d4a3dc57)) by Karl Jamoralin
* **tui:** address code review feedback on FooterHintContext and SubmittingStep ([2979ed4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2979ed45201ab865305192cde17fd1c0069da54d)) by Yi-Ann Chen
* **tui:** update e2e hint patterns to match footer location ([b7ea68e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b7ea68ef7040d4965aa946cb2de69334e531cc4a)) by Yi-Ann Chen

### 📝 Documentation

* update docs for contributors ([f5d230a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f5d230a03854ab35a1bd877c4aea381112706f73)) by Tomas Vik

### ⚡ Refactor

* **cli:** extract turn lifecycle into TurnController ([6eee839](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6eee839dee1f0494013e44bd923a0df38da4e387)) by Tomas Vik
* **sandbox:** extract pluggable SandboxProvider seam ([d14d427](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d14d427065d7c611578bb907a5632d18d7d3f4d5)) by Karl Jamoralin
* **tui:** add FooterHintContext for publishing hints to the status bar ([de1d002](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/de1d0027ba9c2e35a6788c8a9edd128bacb7b362)) by Yi-Ann Chen
* **tui:** derive footer hints from state instead of context ([6a5abd0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6a5abd05f08600f783badb8f5e6b5941902b9f1f)) by Tomas Vik
* **tui:** move inline dropdown hint to status bar footer ([4d9f95d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4d9f95d8cbce68afb684cc3bea7e4c1833c155b3)) by Yi-Ann Chen
* **tui:** move remaining input component hints to status bar footer ([7869081](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7869081ad8933d237977b8ccfec8efec0cc5cf51)) by Yi-Ann Chen
* **tui:** move SearchableList hint to status bar footer ([3bc95aa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3bc95aaf726d80a2af0acf37d5618c203c264fb9)) by Yi-Ann Chen

### 🔁 Chore

* add @gitlab-org/duo-plugin-marketplace to api-extractor.json ([0994f60](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0994f6021d09cb0d27278946a5fb415b65713a33)) by Yi-Ann Chen
* apply suggestion of using a word-boundary check ([0a5e052](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0a5e05200ba757b390592d8cf29bc1769e96245a)) by Yi-Ann Chen
* **deps:** update dependency js-sha256 to ^0.11.1 ([3379c1e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3379c1ed210c2961f01788c43186d52d5fad7d25)) by GitLab Renovate Bot
* **sandbox:** pin sandbox-runtime peer range to 0.0.62 ([316decf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/316decfa169d46b20cea918e161e574f41e8805b)) by Karl Jamoralin
* stricter bun.lock drift validation and mise-managed bun docs ([61d521e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/61d521edba77110e2d1bbc77791eccb7e4a37e75)) by Elwyn Benson

## [8.110.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.109.0...v8.110.0) (2026-06-29)

### ✨ Features

* **cli:** add --output-format json to duo run ([a04371b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a04371b3f46c5db61fcaf2c77441c89442b5cbbf)) by Denys Mishunov
* **cli:** drive plan mode via plan_context item on the registry developer flow ([8b77151](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8b77151cbac471ab51e0d0064c8a34e02a44b536)) by Tomas Vik
* **plugin-marketplace:** marketplace catalog fetching ([8956aa4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8956aa437bd7db7546d3982c948f63df45c1a3e7)) by Elwyn Benson

### 🐛 Bug Fixes

* **cli:** clear workflow id when a workflow is stalled, fails or terminates ([192dbc5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/192dbc5185619e13ef8cd7632053f689a6ca2010)) by Alejandro Metke Jimenez
* **flows:** Filter out duplicated user plan update message ([dada407](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/dada407c2f7937799f89c9ba7feb006401c25298)) by Olena Horal-Koretska

### ⚡ Refactor

* **cli:** extract run result writer and route logs to stderr ([3d0971c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3d0971ccdd0ad1d3760becf8f0557680e765e0d1)) by Tomas Vik

## [8.109.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.108.0...v8.109.0) (2026-06-26)

### ✨ Features

* **cli:** add /compact slash command with compaction card ([6645cc1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6645cc1190050c5f5f37c54bd803fe7343cf8b6d)) by Malte Heuser
* **cli:** gate plan mode with read-only agent privileges ([180522a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/180522a9c30ef07278150b89c346cfedd703c009)) by Tomas Vik
* **cli:** improve MCP and generic tool display of JSON output ([d7ff38e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d7ff38ebf0ce784bb00162af8880b063bb26c53a)) by Alejandro Metke Jimenez
* **cli:** show context-usage percentage in Duo CLI footer ([87d64ec](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/87d64ec13d6bfafc9c5eaa8189a784d9c63c1dbf)) by Malte Heuser
* **duo-agent-platform-v2:** implement health check ([13bd269](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/13bd2699e600ed31e2906d46e8ad651565805e03)) by Juhee Lee
* **plugin-marketplace:** add marketplace and config schemas ([1ef373f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1ef373fb604613844272910657d9d1c123881006)) by Elwyn Benson
* **tui:** add AgentsDialog and extract shared SearchableCommandDialog ([ce1963e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ce1963e56f2963e91871d771fab34802468c1990)) by Denys Mishunov
* **tui:** add CTRL+U delete-line-to-cursor binding ([3474841](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/34748411a1de009ffc12640fcff9e0c2a3a74171)) by Denys Mishunov
* **tui:** add secondaryLabel to ChoiceOption for wrapping tool approval patterns ([bffd196](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/bffd1966f6f43c35726565cb6a16920c32225e5a)) by Yi-Ann Chen

### 🐛 Bug Fixes

* **ls:** validate tool display args at the formatter boundary ([6284b86](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6284b861114387671c4015ecc380a9880e292a2c)) by Tomas Vik
* Resolve active document project when access cache updates ([d240a06](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d240a06e6743f02f2eeb06b35c87448c3ed580dd)) by Olena Horal-Koretska
* **skills:** emit agent-readable skill locations, not file:// URIs ([416ebfc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/416ebfc896c0c0eb809501e3b0461704c27d8ed8)) by Karl Jamoralin
* Slash commands can be submitted while a response is streaming ([c23a47f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c23a47f3896de10fa9651bf7767320ac6d793616)) by Olena Horal-Koretska
* **tui:** centralize input keymap to fix Tab cycling agent on slash completion ([0ad372e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0ad372e113da60bf0c263663c11b6ddb2ff48dda)) by Tomas Vik

### 📝 Documentation

* **cli:** fix run command and clarify working directory in README ([36af186](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/36af186e8971f606021aa5c1092c8b58d97af860)) by Denys Mishunov
* **skills:** add GraphQL skill for version-gated operations ([36ca7f6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/36ca7f6391d42f53d4c74fb1bc9c8c41c898ac1a)) by Tomas Vik
* **skills:** tighten GraphQL skill description and example ([cb8329d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cb8329de4affba6da8a277d33af1926223060ef0)) by Tomas Vik

### ⚡ Refactor

* **tui:** use ChoiceOption<ToolApprovalAction> instead of inline type ([4c6a58f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4c6a58f74b5fc5fc8c46a497796bf437c57eefb8)) by Yi-Ann Chen

### ✅ Tests

* **cli:** Update tool approval handler tests for secondaryLabel ([c21cf60](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c21cf603ff1717562703a423102585ee9f72a68d)) by Yi-Ann Chen

## [8.108.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.107.0...v8.108.0) (2026-06-24)

### ✨ Features

* **cli:** add alias support to slash commands ([d222245](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d222245a5726ba8cac8f414d45e41490f1bf2974)) by James Casey
* **cli:** enable response streaming for interactive developer flow ([1b2b156](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1b2b156179f2702b12beaef2fe1ffea8ddc5db4d)) by Tomas Vik
* **ls:** include 'no skills found' note when agent skill discovery returns empty ([8f7b7a4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8f7b7a476e42e70c661627cfe0955e8e9f8ba740)) by Elwyn Benson

### ⚡ Refactor

* **flow-builder:** make ToolProvider the single tool read path ([b82d58c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b82d58cf18744ce7c25c49df9f01678a391ae091)) by John Slaughter

### 🔁 CI

* enforce compact bun.lock format ([0e63330](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0e633306c1ded2f0276128a9fb19203a9a22e43c)) by Tomas Vik

### 🔁 Chore

* add bun.lock to .prettierignore ([08ee894](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/08ee8945d8edce52ba200a45d9b667ceff312cc6)) by Tomas Vik
* **cli:** reword ModelResolverService fallback logs and skip them for non-chat flows ([399e705](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/399e705223a7de7cc97c9cec36c65adeb5a257a2)) by Kinshuk Singh
* regenerate bun.lock in compact format ([9024adf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9024adf7020184c16f8e12482c425df6125e0f5a)) by Tomas Vik

## [8.107.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.106.0...v8.107.0) (2026-06-23)

### ✨ Features

* **mcp:** forward pending-approval over LSP (2/4) ([f20c175](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f20c175dd7482b4b321208d3455af84cb9d1218d)) by Tristan Read
* **mcp:** MCP approval check in TUI startup (4/4) ([3b250e4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3b250e4d56ff67245ed7817e5d7e0c4a20a7f59a)) by Tristan Read
* **mcp:** MCP dashboard webview approval UI (3/4) ([ca11ee9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ca11ee98a90b23c090216bfee98412111da7e616)) by Tristan Read
* **mcp:** store approval status for MCP servers (1/4) ([b638796](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b638796303f61df13ff12f7a43c598f289bd309c)) by Tristan Read

### 🐛 Bug Fixes

* **cli:** discover symlinked skill directories in workspace resolver ([debd672](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/debd6725e0f9ea7894daccd9cf86a9d2732989bf)) by Denys Mishunov
* **cli:** ensure ctrl-z suspends to background in unix shells ([ca9e43d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ca9e43d27b1be3c293d7da0744b2a617a94875c7)) by Alejandro Metke Jimenez
* improve error messages when backend returns DAP entitlement errors ([e4d3a91](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e4d3a9117024903e42f826356afa15b47dbde78c)) by Alejandro Metke Jimenez
* **secret-redactor:** redact scanner-detected secret in CLI and workflow logs ([2283a54](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2283a54a99728d4a7c6d517f91e6294a6b8c943a)) by Hitesh Raghuvanshi

### 🔁 Chore

* **cli:** downgrade misleading ModelResolverService fallback logs to debug ([5d553cd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5d553cde772c59df015f84491d907c6e641a6ea9)) by Kinshuk Singh

## [8.106.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.105.1...v8.106.0) (2026-06-21)

### ✨ Features

* Add OpenTelemetry ([ec71420](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ec714208848f4786067138d083b79315f1dab02a)) by Duo Developer
* **cli:** render /skills natively in the TUI ([cc80389](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cc8038979520bea6f128eb1666617e893ef28b1e)) by Karl Jamoralin

### 🐛 Bug Fixes

* **cli:** fix file editing on windows ([cff5fd0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cff5fd04a38e2ef331c088b7568bd010ec7b1689)) by Andrei Zubov
* **cli:** improve windows terminals tracking ([a5c08ab](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a5c08ab39c89b03a279609ebcc56ad931e99e517)) by Andrei Zubov
* **cli:** increase glab credential helper timeout ([39a42a6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/39a42a6f47e1c9f8637cc495057c6772751135ed)) by Andrew Calder
* **cli:** remove CHOICE_HEADER references from E2E tests ([5a28fa2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5a28fa2ccb33496ff9c4495c9e13ae74c870334a)) by Yi-Ann Chen
* **cli:** update case of notification settings to match existing options ([36a2bc5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/36a2bc5e3d288d783d996d37658f552d3efe50dc)) by Alejandro Metke Jimenez
* **deps:** upgrade  dependencies to remediate security findings ([c704321](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c70432178d5cc4d4140803da99e970db88a2925c)) by Laura Ionel
* **test:** update E2E test to match removed "Select an option:" text ([cbc7b63](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cbc7b6361e64337f1f67d6d61b3d434349ff048c)) by Yi-Ann Chen
* **tui:** improve spacing around tool cards and approval options ([b2a3bbd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b2a3bbdae5fa0227229a191ab3f27539cb79e768)) by Yi-Ann Chen

## [8.105.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.105.0...v8.105.1) (2026-06-18)

## [8.105.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.104.0...v8.105.0) (2026-06-18)

### ✨ Features

* align MCP Dashboard typography with the chat webview ([9cb5877](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9cb587788b79180a8822055076f9ca4b69f5ac06)) by Karl Jamoralin
* **cli:** display retry attempts in status bar ([b131d17](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b131d176af40a27d53f478ab3721cee1c15c29e8)) by Elwyn Benson
* **cli:** initial implementation of system notifications ([21ecbaa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/21ecbaade6f44363bd07243845c92f7fb9b26c9e)) by Alejandro Metke Jimenez
* **cli:** surface unhandled errors with a /feedback prompt ([7fdee4e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7fdee4eca45aae24dbd7ac9d728b51596943b4d2)) by Malte Heuser
* **duo-agent-platform-v2:** add chat code actions - copyCodeSnippet and insertCodeSnippet ([3ac3af4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3ac3af467fb8409e614ce0f64ed96755ab299daa)) by Juhee Lee
* **duo-agent-platform-v2:** add markdown rendering ([e3e81e1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e3e81e17de176ce074105480fa54ee2fa6e28926)) by Tristan Read
* **flow-builder:** highlight active and visited components on the canvas during execution ([a005c76](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a005c7662580bd4425b083a2db93847c3fc100bb)) by John Slaughter
* Use `software_development/v1` instead of `software_development` ([01cf244](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/01cf24489b157e910505be246c8f0b75eed1027e)) by Olena Horal-Koretska

### 🐛 Bug Fixes

* **ci:** bust turbo bundle cache on version bump ([9a3669e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9a3669ec23a91b62c8dab41d937b69f63fca5ad6)) by Tomas Vik
* **cli:** correctly apply WebSocket proxy configuration in Bun runtime ([6824349](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6824349a1fc9a3127abbd7cff2a757e96136c5ef)) by Elwyn Benson
* **cli:** fix duo cli logs on windows ([ab1816b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ab1816beb7cacc2f0457396571e7ecd06e6361db)) by Andrei Zubov
* **cli:** make plan/build mode switching work under --developer ([8c79b53](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8c79b53ccb6b8ba8e1fe8e5c86dbb2af2b836a62)) by Tomas Vik
* **cli:** prevent malformed tool args from crashing the workflow ([94298a9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/94298a98600d52366d735f6707292a2419339912)) by Alejandro Metke Jimenez
* **cli:** put timestamp before cwd in log filename for chronological sort ([b3120db](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b3120db65b49b953e81fbe857d4e603f15145a06)) by Elwyn Benson
* **cli:** refresh websocket bearer token on credential rotation and surface auth failures ([cf21acb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cf21acbc1068a93d155dc904c2205e09f8d9fbc3)) by Alejandro Metke Jimenez
* render MCP Dashboard webview at full height ([7026f03](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7026f03f851937073e7d3ef65567d07d4147bf7a)) by Karl Jamoralin
* **tui:** remove blank lines and scroll jitter from /model dropdown ([4f017d0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4f017d0667c662d2a8f652dbe57a363f00b7b978)) by Malte Heuser

### 📝 Documentation

* edit GitLab Duo CLI reference docs to align with style guide ([a628649](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a62864998eb21ae59e9c61276a2eab98118771d5)) by Uma Chandran

### ✅ Tests

* add Storybook story for MCP Dashboard ServerCard ([82eb581](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/82eb58178a2c8e865a947127e4bae18d4db569b9)) by Karl Jamoralin
* **ls:** use real Duo CLI checkpoint snapshots in chat-log tests ([4d40758](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4d407587adde41f5e0630c611fc527a2cff09aa7)) by Tomas Vik
* **sandbox:** add behavioral test for sandbox default-deny posture ([2c68086](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2c68086ce186df1dbe5fd2fda8d8e9f2324054ec)) by Karl Jamoralin

### 🔁 CI

* pull ci-node image from canonical public registry ([4b3900e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4b3900e73e7ca870e29cb5f8e0ee9a0d7178b8fb)) by Tomas Vik

### 🔁 Chore

* **cli:** convert build.sh to bun cli ([75951da](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/75951da05c168d689d952eb329343158c5d182cd)) by Andrei Zubov
* **cli:** convert compile script to bun ([b44f1ed](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b44f1ed85ce0e2f26e7d5a54f71b82620ebb10e0)) by Andrei Zubov
* **deps:** update dependency fs-extra to ^11.3.5 ([af6f4d6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/af6f4d69bda870115545bf992a77f80300b23fbe)) by GitLab Renovate Bot

## [8.104.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.103.0...v8.104.0) (2026-06-12)

### ✨ Features

* **cli:** add MCP config file management to '/mcp' ([6f9798a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6f9798a5942321d276bcf22eac3b8d7528416158)) by Elwyn Benson
* **duo-agent-platform-v2:** Add workflow stop button ([76ab9df](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/76ab9df241d2670bfa3aca7c7c94f5d6bf74b804)) by Juhee Lee
* **flow-builder:** attribute execution timeline entries to their component ([db71594](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/db71594c90d94e31b6c57ddd70d027e8c553fc85)) by John Slaughter

### 🐛 Bug Fixes

* **cli:** show absolute log file path on error exit ([0947051](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/094705190716ace72ca9e045f15339b07da23d22)) by Elwyn Benson
* defend against malformed read_files tool args ([1702102](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1702102918628d8c9bb61d40326066e109c3d58b)) by James Casey
* **ls:** redact secrets from system context before sending to backend ([6bf4537](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6bf4537378e772baa97cf3ab7f3d8808fe17434a)) by Tomas Vik

### ⚡ Refactor

* Include header for Gitlab Standard Context ([160e98c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/160e98cf3b5aa0e4918659c1191b286f9bb4b60d)) by Nasser Zahrani
* Remove unused duo_workflow_executor from GenerateTokenResponse ([b8c8e02](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b8c8e02662c18fe44f01cacbf8ea54260286271f)) by Surabhi Suman
* **tui:** extract tty_state ([24dafb1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/24dafb1f2aca6c6c788c7706318f64e4e52a8298)) by Elwyn Benson

### 🔁 CI

* add turborepo remote cache ([1d77610](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1d776103cda1cb213bce9ca45fd24f7917fc79f3)) by Elwyn Benson

### 🔁 Chore

* **deps:** update dependency @anthropic-ai/sandbox-runtime to v0.0.53 ([b6a4b7f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b6a4b7f95d4cde4b319b5001c707449b80bd3013)) by GitLab Renovate Bot

## [8.103.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.102.0...v8.103.0) (2026-06-10)

### ✨ Features

* **cli:** add hidden --developer flag for local developer flow ([58fad78](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/58fad784307c0d6d5ba06cca83d898a4fe821231)) by Tomas Vik
* **cli:** gate Duo CLI behind duo_cli_enabled admin setting ([d7d5dfc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d7d5dfce41c3b368ec6a2229af5431ea2b0a97b0)) by Anna Springfield

### 🐛 Bug Fixes

* **cli:** pass developer/local as workflowDefinition in --developer mode ([da647fa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/da647fa557c8c7a2797d62f7d239d0ec56298521)) by Igor Drozdov

### 📝 Documentation

* npm package resolution issue for cross registry packages ([e304981](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e3049818969fd93d4663a767d7f09194c6930fe8)) by Aboobacker MK

### ⚡ Refactor

* decouple tool-input formatting from action handlers ([1f06785](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1f0678500af8cb9130c3600a4cf798e532c449cf)) by Tomas Vik

### 🔁 Chore

* **deps:** bump glab to 1.102.0 ([69573ff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/69573ff5c3b15ee3a5bfd9fcced3d8f23816fe56)) by James Casey

## [8.102.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.101.0...v8.102.0) (2026-06-10)

### ✨ Features

* allow cancelling workflow retries ([27e744d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/27e744d3ef080807ebbfb0c4cd2eea3bdf2437dd)) by Elwyn Benson
* **cli:** restyle MCP tool messages ([b585931](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b58593168b53acc06ca032ccc730611f7943e344)) by Alejandro Metke Jimenez
* **tui:** render todo_write tool as a status-icon checklist ([092371a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/092371a02c857a1e0ddb8be09c1a34bb2c1abfd0)) by Igor Drozdov

### 🐛 Bug Fixes

* **cli:** display all parallel tools and skip empty agent messages ([fdf10a5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/fdf10a5e1945b4d01735023279291c32b1ae4448)) by Igor Drozdov
* **cli:** fall back to user's default Duo namespace for model fetching ([353a855](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/353a855268786249fe40c0fd73ee26c36888d2e2)) by Elwyn Benson
* **cli:** fix duo-cli being unresponsive on windows terminals ([430f261](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/430f261999acc0de63f5a4e40fc1e0adc4a0e354)) by Andrei Zubov
* **cli:** prevent header and deprecation notice overflow on narrow terminals ([6a726c9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6a726c965f01f3557fdd98b51efd8933b0225986)) by Tomas Vik (OOO hopefully back on 2026-06-09)
* **dap:** only disable DAP for duo-off group namespace ([4dc2cbd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4dc2cbd8e943df3a8bda1008fa1d8c298767f01e)) by Laura Ionel

### 🔁 Chore

* fix latest version definition for duo-cli install script ([247ec22](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/247ec22ab64e4160ff5776c4254598623f537738)) by Andrei Zubov

## [8.101.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.100.0...v8.101.0) (2026-06-05)

### ✨ Features

* **cli:** add pattern-based tool approval support for CLI ([28a07f3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/28a07f30c24642e0c55a4b639dfbc5693f6f784b)) by Dylan Bernardi
* **duo-agent-platform-v2:** add slash commands ([ce42b5e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ce42b5e374755ed57cd7baf69b3c9c95d7a8cba2)) by Juhee Lee

### 🐛 Bug Fixes

* re-evaluate code suggestions language check on document open ([13da716](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/13da716bedc693c20a6def0f41cabdc50472ed47)) by Karl Jamoralin

### ⚡ Refactor

* **ai-config:** scope MCP config candidates and add unmanaged seeding ([a0ad485](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a0ad485c7a0a36feb6e22119e27d79d3f1f1994a)) by Elwyn Benson

### 🔁 Chore

* add modern duo-cli compiled binary for linux x64 ([855434f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/855434f6d9abe54c79c1f9a9737c469c3703945f)) by Andrei Zubov

## [8.100.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.99.0...v8.100.0) (2026-06-04)

### ✨ Features

* **dap:** Allow for pattern approval for session ([cba2a46](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cba2a464b40ad4376caa01de7b7938d935d1ce8e)) by Dylan Bernardi
* **sandbox:** sandbox-aware error handling for AI model on macOS ([40060dd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/40060dde6a1c0aa0fde452ce43f417bb38f1654d)) by Karl Jamoralin

### 🐛 Bug Fixes

* allow read_file/read_files to access files in trusted directories ([36f1d3f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/36f1d3f9816c2001f9315f9e9a966a735837e9ac)) by Karl Jamoralin
* **cli:** improve slash command description search matching ([630d43c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/630d43c1aa517fcccdf227b6bc7600e7ba28da8e)) by James Casey
* **cli:** re-present tool approval prompt on session resume ([33ce189](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/33ce18990151727eafb8485eae7fcb8b0212e944)) by Elwyn Benson
* **ls:** move RG_BINARY_NAME to node entry to fix browser bundle ([2526e70](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2526e70cd6a6c382c344dd4f2f62586071dad712)) by Elwyn Benson
* **tui:** prevent duplicated output when starting a new session ([0fddfbd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0fddfbdeeb98b1c953f797c9a56d41dc108b5d37)) by mltheuser.gitlab
* **tui:** thread columns into tool tree so content wraps inside <Static> ([ae21e79](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ae21e791e033151f7f309922fa58b0e0602686d1)) by James Casey

### 🔁 Chore

* change duo cli linux x64 target platform ([aedd266](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/aedd266475bf38d0cf32affad9110aa138b7b711)) by Andrei Zubov

## [8.99.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.98.0...v8.99.0) (2026-06-02)

### ✨ Features

* add usage quota alert ([e7ea41a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e7ea41a31f927a25e739f88da3dc2f9c4ae61a88)) by Juhee Lee
* **cli:** enable oAuth flow for MCP servers ([ac6c102](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ac6c102d9721a66ab2feb7b1e72ede501ac2f7e2)) by Elwyn Benson
* **cli:** rehydrate session history when using `--existing-session-id` ([8d172d9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8d172d93bad8fd52cd40d66da57dbffc59432283)) by Elwyn Benson
* **cli:** render links with OSC8 ([c2abbed](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c2abbedf350947ed4b1fa7c52e4d9c76395fb7d8)) by Tomas Vik
* **flow-builder:** add labels under action bar icons ([3756e9b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3756e9b09d46465dcc9520e93867a3685a69321c)) by John Slaughter
* **flow-builder:** route Zod schema issues to source nodes ([e9d7f7d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e9d7f7d78986db7d99c371dbae855bbf9b3977b3)) by John Slaughter
* **flow-builder:** validate edge condition references against upstream nodes ([924f9b7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/924f9b70160fb01270fc33390b89aa0da983d30e)) by John Slaughter

### 🐛 Bug Fixes

* `/mcp` panel cannot be dismissed with Escape ([b266e16](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b266e167b449c6c7261057b4aeddd2126d19f022)) by James Casey
* **ci:** add conventional-changelog-conventionalcommits as direct dep ([fc9807a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/fc9807ac7ece810017f13bb7864b5befc8bb8f2b)) by Elwyn Benson
* **cli:** fix glab feedback submission ([9868824](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/98688240d6aee3de357f2551a675277ad6cfd5e3)) by Anna Springfield
* **ls:** replace fixed 15s initial delay with exponential backoff up to 20s in NodeExecutorWithRetry ([1b9c7d6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1b9c7d6dc42907fb3ffc3fda04b8d82b4b1c493a)) by Halil Coban
* **ls:** split session trailers into two separate --trailer args ([9320a24](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9320a24ad0aa3da784757d6948d000109b654ac1)) by Roman Eisner
* revoke workflow token once in retry wrapper, not per attempt ([445cd80](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/445cd803c45970cd1426c96530a12add539b6cdd)) by Elwyn Benson
* **tui:** resize hack ([eb2a6c5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/eb2a6c58ff278191f930b6078a3ae4c98f19ea99)) by Malte Heuser
* **tui:** suppress update banner when deprecation notice shows ([045decd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/045decdfc243337aab177d551ee5535bb24cfbf0)) by Malte Heuser

### 🔁 CI

* **cli:** fix e2e test recording upload ([2052e5f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2052e5f264e8dc2d184eaadb7d23f44b3829fda6)) by Tomas Vik

### 🔁 Chore

* **cli:** add --skip-token-check flag to bypass token validation ([1f161ab](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1f161ab9abd8494c0183a27b51224712ee015439)) by Tomas Vik
* dead code detection and removal ([bb6c61c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/bb6c61c24912a761cbfb7b656bb5e711e5eaf2f3)) by Tomas Vik
* **doc:** update development docs with common terminals section ([c990432](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c990432bb5a5c898d0232d9b6713fc6eaffa17cf)) by Andrei Zubov
* publish sourcemaps to sentry ([0ed6194](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0ed61943a86aef739c93abaf23f4bf204d2e767a)) by Andrei Zubov

## [8.98.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.97.1...v8.98.0) (2026-05-25)

### ✨ Features

* add session URL trailer ([b87153c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b87153cc31694db01db1b541e29e50c8a3e65511)) by Roman Eisner
* **cli:** show MCP tools in each server ([b5dcd34](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b5dcd34f4d16bcda18caff424cd51cafc57dadca)) by Elwyn Benson
* **cli:** update exit summary to show session resume information and log hint on error ([ceeb9f6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ceeb9f62197f94153a4cdeba8f55cf17ecc37c92)) by James Casey

### 🐛 Bug Fixes

* **cli:** pass workflowDefinition to RunWorkflowPayload ([78a7f55](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/78a7f5544be7881cf9aa9ac326a035cce7e7c9fc)) by Jean-Gabriel Doyon
* **cli:** retry individual e2e test cases instead of whole CI job ([8220952](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8220952e76d76c4c852c615f791f9da56a13657b)) by Tomas Vik
* **tui:** diff content overflows past terminal right edge when rendered inside BaseTool container ([d9a433e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d9a433efbd8cf83506f6b263b4eb9e4bfdda6f86)) by James Casey

### 🔁 Chore

* **cli-e2e:** redesign test framework ([33ce08e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/33ce08e87fbe32d2be9a9a406a3a290e6fdff18f)) by Tomas Vik
* **deps:** update dependency @vue/server-renderer to ^3.5.34 ([9194952](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9194952c7e67ff2094a477ee89f1be63ba0793ed)) by GitLab Renovate Bot

## [8.97.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.97.0...v8.97.1) (2026-05-25)

### 🔁 Chore

* new build system ([73d70f3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/73d70f388a7c70d22891c032bc6b2a33efbc6ca4)) by Elwyn Benson

## [8.97.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.96.0...v8.97.0) (2026-05-22)

### ✨ Features

* **cli:** add tools count to MCP panel ([495aec4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/495aec4eb0e0c4e4110a0de65199f80469b38c1f)) by Elwyn Benson
* **duo-agent-platform-v2:** add thinking indicator and autoscroll behaviour ([8acee45](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8acee4531e0ecc2d0e1032b2e93af0849e770de2)) by Mohammed Osumah
* **ls:** implement incremental streaming for duo workflow chat log ([9b04042](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9b04042d5d1624da94121f0c79e9c885da1d97d0)) by Igor Drozdov

### 🐛 Bug Fixes

* **workflow:** drop leftover -c args from runShellCommand ([6b07ea7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6b07ea70cc0aa4563749f427a82220e226816a70)) by John Slaughter

### 🔁 Chore

* **cli:** use pre-built binary in headless e2e docker scripts ([e8e8c91](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e8e8c91b89636a1daee197f1459b52b6f7592d5e)) by Elwyn Benson

## [8.96.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.95.0...v8.96.0) (2026-05-22)

### ✨ Features

* add action label and details for FeatureStateCheck ([e20e54c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e20e54cbfba0d070f92b4e3c973e45be11ae8d89)) by Laura Ionel
* **ls:** enable web_search client capability for Duo CLI workflow ([db812f0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/db812f00947eea55c4ce048cbc96442cf954849e)) by Igor Drozdov
* **sandbox:** default-deny reads outside workspace ([0a07539](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0a07539e4f619b65b020c1b368597c3a3d4a5143)) by Karl Jamoralin

### 🐛 Bug Fixes

* bundle ajv deps to fix downstream errors ([2ec090d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2ec090d790fd791c7e1c43820c22e16e09d6f3b1)) by Tristan Read

### 🔁 Chore

* **cli:** add npm deprecation warning ([94d9039](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/94d9039d706eac1ae7b87e540131abc1a025980e)) by Malte Heuser
* **deps:** update dependency @anthropic-ai/sandbox-runtime to v0.0.50 ([78a2556](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/78a25564c969a2abde6f53aec8a1c859e328185e)) by GitLab Renovate Bot
* **deps:** update dependency @anthropic-ai/sandbox-runtime to v0.0.51 ([c94d6b5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c94d6b52bf3438d8faa0fd85623de9791b80ad06)) by GitLab Renovate Bot
* skills - use `project` instead of `workspace` in UI text ([399ac82](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/399ac824e8417a7368c45c6c78d661bdda832293)) by Uma Chandran (OOO until May 27)

## [8.95.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.94.0...v8.95.0) (2026-05-20)

### ✨ Features

* **cli:** add /mcp slash command and MCP panel ([d668298](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d668298851fc66a325cf7b549ce600c53e8d21d2)) by Elwyn Benson
* **cli:** require double esc to confirm cancelling stream ([071bd5a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/071bd5a03dd2abbcbd28fa83820f3ce5ff2fea0a)) by Elwyn Benson
* **cli:** SessionStart hook ([bd67e35](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/bd67e35e2422598cbf73a07484d07a404f0908cd)) by Tomas Vik
* set AI_AGENT env variable in spawned child processes ([4ca38d6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4ca38d6b5dd081b5b6f239f0c5749673f511bc8a)) by Tomas Vik

### 🔁 Chore

* clear destination before copying watch script artifacts ([cec6e26](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cec6e26f1921345dfd4b3a110050fade2309b6be)) by Olena Horal-Koretska
* load selected agent when loading old chat ([522cbf7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/522cbf70318b44c83122fe9fad48e1629878bfd0)) by Juhee Lee
* replace remaining npm run with bun run for local development ([aac1ce2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/aac1ce270b7dd5ef2edb14d3163ef0675a0c135c)) by Tomas Vik
* update linting tools and linting container image for docs ([22b4104](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/22b410458052f8ad0d9037b6159376784462707f)) by Evan Read

## [8.94.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.93.2...v8.94.0) (2026-05-18)

### ✨ Features

* add ai context items ([23a2544](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/23a2544860cd541d307f032e23a8a7feb797d5ea)) by Juhee Lee
* **cli:** Add /doctor slash command for diagnostics in the cli ([0272116](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0272116bb39a7c0fbc195513842c16ce4f522c8b)) by Malte Heuser
* **flow-builder:** add runtime-provided variable registry for merge fields ([52e4bab](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/52e4bab1b74d2a25bca376de6d19f76d2591b57c)) by John Slaughter
* **flow-builder:** unify validation issues end-to-end ([3565c59](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3565c59dc77be2a0cbaafd7be4803ab05cc8de79)) by John Slaughter
* generate duo cli docs automatically ([229ffe6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/229ffe65a9dbef96cdb85c468626647f35b63ba6)) by Andrei Zubov
* pre-select files context category ([ca8f325](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ca8f325ff0c4dc7e1c2b53e7f85ca87df552e801)) by Juhee Lee
* **sandbox:** add --sandbox CLI flag to enable sandboxing ([ab12e36](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ab12e362318f3188af040afae27318aef69d2413)) by Karl Jamoralin

### 🐛 Bug Fixes

* **flow-builder:** replace native confirm() with dialog for reload discard ([ae6d573](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ae6d57307501ef7c32881a74a6a2f04474055810)) by John Slaughter
* **sandbox:** embed sandbox worker in compiled CLI binary ([4427136](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4427136654ade8a6f9f70bec4452c765e9b5fc8a)) by Karl Jamoralin
* Treat empty string options in flow config as undefined ([6d19aa4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6d19aa45f85b7aade76cddb124f991641b25c8e8)) by Olena Horal-Koretska
* **tree-sitter:** resolve wasm path at runtime in bun-compiled binary ([1ce20b8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1ce20b80d1d1ea9a1e7a41094814954809a7724e)) by Karl Jamoralin

### 📝 Documentation

* replace invalid 'bun run -w' with 'bun run --filter' ([7754f01](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7754f01dd01e662923403b26a468ee603043c74a)) by Tristan Read

### ⚡ Refactor

* **cli:** sync full MCP server objects ([cce1d35](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cce1d35947e19937bdafd5e073755c1efc9bc6f0)) by Elwyn Benson
* **mcp:** remove GITLAB_WORKFLOW_SANDBOX stripping logic ([f47da33](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f47da338dcc4bb2be54604678aede9523fe26060)) by Elwyn Benson
* move workflow event utils to workflow-api ([9a8bc77](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9a8bc775a493b5883f52b55125743b17586b1f36)) by Elwyn Benson

### 🔁 CI

* allow cancellation of MR-only deploy jobs ([3dd1480](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3dd14802d5923b445a36dcca8afc8e402ffbf51c)) by Tomas Vik
* auto-cancel redundant pipelines on new MR commits ([8bd2d9c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8bd2d9c016fb5e5ad895d57ba22cb08bf26fdbb8)) by Tomas Vik
* mark build-ci-node-image as non-interruptible ([1d31eee](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1d31eee9d04380c50f7e49f9b074f48154e68294)) by Tomas Vik

### 🔁 Chore

* **ci:** skip lint_commit job on draft MRs ([72f2163](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/72f2163939004828ff7f3218ec7ccdae6cfc488a)) by Tristan Read
* **cli:** suppress noisy e2e log/recording errors when files don't exist yet ([3ccb40d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3ccb40d65a20b87c2acd21fec579eb6dd23a3e32)) by Elwyn Benson
* move all usage quota service exports to node subpath ([c3ded6a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c3ded6afe7e6a9639efc0f00fd9f4b6a3d0994d2)) by Juhee Lee
* split UsageQuotaService interface from node-only implementation ([adcfe1e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/adcfe1ee1626cd6686d1cda189f68c38af85490d)) by Juhee Lee
* update glab ([e116c74](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e116c74729c88598e0989b57c4f9d829f1a9616c)) by Tomas Vik

## [8.93.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.93.1...v8.93.2) (2026-05-11)

### 🐛 Bug Fixes

* **ci:** include bun.lock and CLI package.json in release commit ([4905182](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/49051825918cd267b3baa2420ab9cbd8f8e912dd)) by Tomas Vik

### ⚡ Refactor

* add label to feature checks ([95179b9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/95179b970ffcb66c3a783ef13aa7d100001543b2)) by Laura Ionel
* **sandbox:** invert mcp transformer dependency to break cycle ([11ebdcc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/11ebdcc0538e96156080cbf70febb3ab29a12710)) by Elwyn Benson

### ✅ Tests

* **cli:** add certificate and proxy E2E test suite ([82ecff0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/82ecff0028944e75ac1970ef6eb8e2baadaed419)) by Tomas Vik

### 🔁 Chore

* **ci:** extract bun version from mise config instead of synced variable ([6593f4a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6593f4a76241d213a06d664741fef4505ee5755d)) by Tomas Vik
* Fix sandbox feature const re-export ([ef6e6e9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ef6e6e9cd682632f9ee506db8aaa1608cf17c31f)) by Olena Horal-Koretska
* remove node_modules being in the path for project's config.toml ([dc6a5b9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/dc6a5b9d7a26e7cf14fe7757222062766b0c29be)) by Andrei Zubov
* update lockfile with config version ([db2c55e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/db2c55e2e06a0f0d0e3363fde9dbbbb8fe0b3236)) by Tomas Vik

## [8.93.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.93.0...v8.93.1) (2026-05-11)

### 🐛 Bug Fixes

* **cli:** add missing tags and title conventions to feedback issues ([0b6694a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0b6694af9a969e645c90e1775e7d2451f23e1a76)) by Andrei Zubov
* **deps:** upgrade zod to v4 and fix breaking changes ([fff92ce](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/fff92cef542bd5d5f73837cf048f4ac613b144b8)) by Enrique Alcántara

### ⚡ Refactor

* **sandbox:** add feature state checks for sandbox status ([8089e97](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8089e9701f4bf7595f541202d51d15c299428321)) by Karl Jamoralin

### 🔁 Chore

* update bun version and bring back windows-arm64 binary compilation ([7fe7b86](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7fe7b868d2f5668a183bfc7d26dfebdec8a41cbd)) by Andrei Zubov

## [8.93.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.92.1...v8.93.0) (2026-05-06)

### ✨ Features

* add Websocket health check ([17fb56c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/17fb56cf1607b4f261d70176b919347ef6e6cf98)) by Laura Ionel
* **cli:** /settings slash command (telemetry/skills) ([ce220d4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ce220d44a6f856b14a4fe396f46ac2f4f9f9d000)) by Tomas Vik (OOO back on 2026-05-11)
* **flow-builder:** add AI Catalog flow storage backend ([851a693](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/851a6931c3957518b54cebd8ed2951d6ee2da81d)) by John Slaughter
* **flow-builder:** add welcome state for empty canvas ([e5f6dc3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e5f6dc303f19ba60b83b4b98a2d76061e7ee884e)) by John Slaughter
* **flow-builder:** catalog flow picker, save dialog, destination indicator ([3172066](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/31720667d0d7590194da2bbf1ab1fa78ebf9b85b)) by John Slaughter
* **flow-builder:** disable save on empty canvas with explanatory tooltip ([3390b33](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3390b3340c47b3d259fed132594f0681770fe6e9)) by John Slaughter
* **flow-builder:** surface session info and AI Catalog permission gate ([caf4219](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/caf4219e2d593f4e293336a799631e9de59730a1)) by John Slaughter
* Support virtual filesystem workspaces in Agent Platform ([b5a633f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b5a633fa07a70b473d9a12898e039dde1d6ca877)) by Karl Jamoralin

### 🐛 Bug Fixes

* **flow-builder:** accept string shorthand for component inputs ([ab5f103](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ab5f103b2e99282fe186bdb5170d151d5c27d3ca)) by John Slaughter
* show chats with foundational agents ([aec5c37](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/aec5c3717afaffc10325b61f8c2dee457e5a7308)) by Juhee Lee

### ⚡ Refactor

* **flow-builder:** extract catalog URI helpers to browser-safe module ([5f7e203](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5f7e203c21bb67adca3fc5f162f739f48e181907)) by John Slaughter

### 🔁 Chore

* **cli:** add tui-ctrl CLI for agent-driven TUI testing ([cbf312e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cbf312e537997a470d76a1e46959ae587ad5c252)) by Tomas Vik (OOO back on 2026-05-11)
* **deps:** update @gitlab/duo-ui to ^15.25.0 ([584cddf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/584cddf976552f6a81de5be426544c90db7b88a7)) by Olena Horal-Koretska
* **deps:** update dependency @monyone/aho-corasick to ^1.1.10 ([7e082c2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7e082c2d1ea9096f93ce88a16b96aa845220c05e)) by GitLab Renovate Bot
* fix compiled windows binary name ([a2449b4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a2449b4361555135c7f83a9537494219b300ec1e)) by Andrei Zubov
* fix signing compiled windows binaries ([91bae56](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/91bae56a5c8457f1661a8a339f234add34719b0e)) by Andrei Zubov
* switch LS compilation to bun ([6a88e55](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6a88e55feddea3ea5898a0eff56055a5b72a54c1)) by Andrei Zubov

## [8.92.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.92.0...v8.92.1) (2026-05-01)

### 🐛 Bug Fixes

* **secret-redactor:** redact access tokens in git urls ([0b842c1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0b842c10340198fe2cd4808c058ef323ae8b082f)) by Tristan Read

### 🔁 CI

* **docker:** activate mise in CI bash sessions for runtime-installed tools ([e27d7a8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e27d7a84c5585284eafd782535ba43cdec0700cb)) by Tomas Vik (OOO back on 2026-05-11)

## [8.92.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.91.0...v8.92.0) (2026-04-30)

### ✨ Features

* add flow versioning to proto fields ([abeed4c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/abeed4c114c48cf394c74a152b7a3d800ff448e7)) by Andrei Zubov

### 🐛 Bug Fixes

* fix deploy failure when could not create release asset link ([b301541](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b3015416bd4abd2591368eca4df6448674d3fb93)) by Andrei Zubov
* fix ls publishing to npm ([d197554](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d197554587c9bc8f5be694b6e72d99b13a2088f0)) by Andrei Zubov

### ⚡ Refactor

* **sandbox:** surface SandboxUnavailableError to users ([48d4cc7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/48d4cc78bae2cdf42b4a6a327b05a7f46ffbac5a)) by Karl Jamoralin

### 🔁 Chore

* add customer consent for cli beta ([98125e0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/98125e062645e413646d0fcecd7017acf3e30f33)) by Amr Elhusseiny
* add customer consent for cli beta ([5f80968](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5f809685552975bed5d9b8c7920cf5313ba231ca)) by Tomas Vik

## [8.91.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.90.0...v8.91.0) (2026-04-29)

### ✨ Features

* **flow:** tool multi-select picker for agent node configuration ([f99924e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f99924efdf81bf130f423535de16089bfc68e7fe)) by John Slaughter

### 🐛 Bug Fixes

* fix npm publishing for duo CLI and LS ([36da7ce](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/36da7cee932ba4a3a859c908252743523194a586)) by Andrei Zubov

### ✅ Tests

* **cli:** record e2e tests and upload failed recordings to asciinema ([fba041c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/fba041cca34f1778d6d7b04338becbb490227654)) by Tomas Vik

### 🔁 Chore

* **tui:** upgrade ink to 6.8.0 ([a92c83a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a92c83ae7a14d3742a8094d5d939252db819b863)) by Elwyn Benson

## [8.90.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.89.0...v8.90.0) (2026-04-28)

### ✨ Features

* Add config validators for DAP and Workflows ([0bb43f4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0bb43f4c54209841bad814bfc6e9909704d8eaa7)) by Dylan Bernardi
* **cli:** make /settings toggle and persist telemetry ([b04bcc3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b04bcc3de9e18f6cd8623d03f09e8cedbe0612ec)) by Tomas Vik

### 🐛 Bug Fixes

* **ci:** use TLS-disabled DinD and add asciinema tools ([f4df23c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f4df23cb83e6e53fac86ac340ca0f256701462c6)) by Tomas Vik
* **cli:** fix setting rootNamespaceId for duo run command ([27b1c2a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/27b1c2a157625448c5bf053b01c67deb407bbc85)) by Andrei Zubov
* **flow:** guard minimap retry against visibility race ([c55cbdc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c55cbdc8110b7df3aeaa84a977fbe1f4dfce3504)) by John Slaughter
* **ls:** use bun instead of npm in agent-config.yml setup script ([4f8c512](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4f8c5121c20e8b5726a4d6d242915d398b97b022)) by Thomas Schmidt
* **tui:** improve markdown rendering for lists and headers ([640d289](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/640d289d6eabbed429c9fc236b1754f6afd74260)) by Tomas Vik

### ⚡ Refactor

* extract code suggestions feature state direct access check to service ([d5d4aa5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d5d4aa5cac2f45e16d2e433459f900f2a53b271f)) by Mohammed Osumah
* **sandbox:** fail when sandboxing is unavailable ([d25ea22](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d25ea22e9bfb380b7a43787c98424f74960e6a8d)) by Karl Jamoralin
* **sandbox:** wrap STDIO MCP server launches with srt ([2285bec](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2285bec33e04ab20978ac48b05cfdad81be1246d)) by Karl Jamoralin
* **tui:** vendor marked-terminal as TypeScript source ([71e4296](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/71e429677fa555c5b05dadf7ddd3cd4586e151d6)) by Tomas Vik

### 🔁 CI

* add ci-node Docker image with mise tools ([580ff19](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/580ff190106116c5f248415c5cd28b4669933f2d)) by Tomas Vik

### 🔁 Chore

* add customer consent for cli beta ([758d09f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/758d09f185e4e7012b909e371bdd8b2b3bc1db92)) by Tomas Vik
* add integration test for ripgrep ([3b4f879](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3b4f8793e95e9b7966802eb9d97878987fa5c605)) by Javier Gonzalez
* **deps:** update @gitlab/duo-ui to ^15.21.1 ([c738687](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c738687be15016cead00f4c9a247fa68d67ddf15)) by Olena Horal-Koretska
* Drop unused `NullVirtualFileSystemService` ([dfee3c3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/dfee3c35c0323f54a2d2bfeac41c5d7f5851152c)) by Olena Horal-Koretska
* migrate to bun ([f97a0ef](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f97a0ef96b3778c986c4f9e28232084e7223156a)) by Tomas Vik
* **telemetry:** cache lastActivity in daily_activity_tracker and move IDE version warning ([4e70286](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4e70286fd4e18c7d64a7186cd1fe7c2e848ea1b1)) by Malte Heuser
* use mise trust to unblock Duo flows ([a758c9a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a758c9abf483f642795dcd5beb4c00abe13c86eb)) by Erran Carey

## [8.89.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.88.0...v8.89.0) (2026-04-20)

### ✨ Features

* Add run command timeout ([ef388a9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ef388a96a6fa0d04619e933c791391356f382c91)) by Olena Horal-Koretska
* add TUI testing and recording agent skill ([68232a5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/68232a55a538b0ced080fa762ce60e630c79a72b)) by Tomas Vik
* **cli:** add log preview to feedback flow ([57f3fc5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/57f3fc5f92c80c92121cd82122d9d00eef3b81e0)) by Anna Springfield
* **cli:** enhance tui-testing skill with response detection and local build support ([1145ab6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1145ab67109af353a7214ceaee7b2c18d7c8d032)) by Tomas Vik
* **cli:** support user interruption for command running in CLI ([66fc334](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/66fc3347adf9dc78d123066b774f9a4a2cd85c6e)) by Olena Horal-Koretska
* **flow:** add interactive minimap and always-visible zoom controls ([1a639ca](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1a639ca5a67b704ec7b2e0cff6bf330e973e05cc)) by John Slaughter
* **flow:** inline merge field pill editor for local prompts ([a473c6d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a473c6d453899b098d2feb4b6d743f5632eac9b2)) by John Slaughter
* Prewarm System Context ([c58d9c1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c58d9c149bcfa18f66581781e7204b86ccb401b7)) by Olena Horal-Koretska

### 🐛 Bug Fixes

* **cli:** always fetch project details ([67232db](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/67232db6a408e707ff8e95d039ca9be6c5da12b0)) by Donald Cook
* **cli:** check mcp config approvedTools before prompting for approval ([ee3ee8d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ee3ee8ddd0a0b92822ba829f544017fff029ee14)) by mltheuser.gitlab
* fix the input text being lost when using history navigation ([f4813d4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f4813d41e1204c9130c69462f41c02c8a3683fa4)) by Andrei Zubov
* **mcp:** upgrade @modelcontextprotocol/sdk from ~1.17.5 to ^1.29.0 ([e376d90](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e376d90b6e1f6d561b23e30214ccae59db32b3b3)) by Tomas Vik
* **tui:** reset Dropdown selectedIndex when items change ([50de606](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/50de6064da36311867c654080b04d92b8cc4c713)) by Tomas Vik

### ⚡ Refactor

* **cli:** slash handlers return results instead of mutating state ([9279ce2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9279ce23345e05f3164e7a41dcf1b1e8ce906940)) by Anna Springfield
* **flow:** extract flow builder to @gitlab-org/flow-builder package ([2e20556](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2e205562ebbdafe2d56e6ada8eefed3e5fb4b9e5)) by Elwyn Benson

### 🔁 Chore

* (cli/tui) update user-facing mentions to use the full GitLab Duo name ([1a8a4e8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1a8a4e8853d86a1f3664e93ddd52d71bb92df37f)) by Uma Chandran
* add asciinema auth setup for CI and Duo Developer agent ([78bd434](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/78bd43430e413436776f283acfdf95c67790057a)) by Tomas Vik
* Refactor snowplow tracker to deduplicate ([95678b1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/95678b15925308b466832000f14b8b1d6f5c6cbd)) by Dylan Bernardi
* Rename projectId to projectPath where path is used ([47def7b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/47def7b000cb183d35a991bfcc2301d9bd376e07)) by Dylan Bernardi
* upgrade Node.js to 22.22.1 everywhere ([b1bae19](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b1bae1964ba6d36009cbe3607e77631034eff14a)) by Tomas Vik

## [8.88.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.87.0...v8.88.0) (2026-04-17)

### ✨ Features

* add ClassicChatLicenseCheck for Duo Core chat gating ([08ccb0b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/08ccb0bb66a2028057cfd42ad8abbf39d0660861)) by Donald Cook
* **cli:** add --settings-tui flag and /settings slash command stub ([8bc4efc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8bc4efc9dc9bffa203c510671243ffedebda0f24)) by Tomas Vik
* **cli:** implement /exit slash command ([0d8ede9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0d8ede97d89cb2629de781de0df296ff717217cb)) by mltheuser.gitlab
* **duo-agent-platform-v2:** add agent selector ([9666b59](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9666b59bbd647e714af4ba804135fd3885a2ea4a)) by Juhee Lee
* **tui:** auto-detect terminal dark/light theme ([c1de17f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c1de17f947a015e54858c3be48a514e05eb00afd)) by Elwyn Benson

### 🐛 Bug Fixes

* **sandbox:** add worker entry point to desktop esbuild build ([8977f7b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8977f7bf424c9dfa35783a410aaea07fd4d69433)) by Karl Jamoralin

### 📝 Documentation

* **cli:** document beta consent ([bdecd88](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/bdecd88b67d66f053d32dc3981ab9b5655ce3a40)) by Tomas Vik
* update MR template for AI ([773cc96](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/773cc96969882cda6df5e14914859421d8910a3b)) by Tomas Vik

### ⚡ Refactor

* move test guidelines from AGENTS.md to testing skill ([aa79016](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/aa79016d398dde97be66469f5e9ff0ec6b4b5bcc)) by Tomas Vik
* **sandbox:** bump srt to 0.0.49 and wire allowRead through config ([398894c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/398894cc318b8930ce952bde36be4be9a2e4365e)) by Karl Jamoralin

### 🔁 Chore

* add customer consent for Duo CLI beta ([c45b1ab](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c45b1ab8db7895d19b14e0d9855208175e26da1d)) by Amr Elhusseiny
* add glab to mise config ([f59c31f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f59c31f27f09e588558630b6a5e40eac252c6435)) by Andrei Zubov
* address review feedback ([185171c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/185171cd232ab4c2a9ded04494299a4438c3be87)) by Andrei Zubov
* **cli:** add glab dev scripts ([5410efb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5410efbd73735a5de8dfefc67e2dfc70100126a8)) by Andrei Zubov
* unify duo compilation scripts ([e7cdb55](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e7cdb5546bdebcbb91500cbecb9678eb0f2db507)) by Andrei Zubov
* update GLAB_DUO_CLI_PATH env var to match glab implementation ([40ae1dd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/40ae1dd83bd3e34c421b36d0fdb2c2286cbb929d)) by Andrei Zubov

## [8.87.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.86.0...v8.87.0) (2026-04-16)

### ✨ Features

* Add green left border to tool call components ([25de3d7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/25de3d7c6ef02e22677d2916d6c09598bd6907e4)) by Tomas Vik
* **chat:** hide non-selectable agents from chat agent picker ([6fec7af](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6fec7afc8241798493443550e8f021d8ed16aef6)) by Eduardo Bonet
* **chat:** Show tool approval for session as turned off ([d1ed893](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d1ed893571c13dcfabbdee117ecd46acd4c244c6)) by Dylan Bernardi
* **cli:** add theme-aware background highlight to user messages ([e1acbac](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e1acbac75daab85ccdf5d6b7e4336a47f070949e)) by aregnery
* **flow:** fit canvas to nodes on load ([f988ee7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f988ee7cae74eff73fee04e95eaba8f3cd8bcd44)) by John Slaughter

### 🐛 Bug Fixes

* **cli:** don't show config screen when running through glab ([7905733](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/790573389792e4f02db78bea9632858728792232)) by Tomas Vik
* **code-suggestions:** handle 422 error when default namespace not selected ([9f061f3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9f061f3fc32640ee1b628d9737020843168b56f4)) by Mohammed Osumah
* improve mcp initialisation performance for DAP ([35a377d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/35a377ddb31197c5d04dbfb01a33b34472b6885e)) by Andrei Zubov
* show credential-source-specific hints on token validation failure ([a9dbcc2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a9dbcc22bd3c68c1044fc1e2d26eda33adc71c9d)) by Tomas Vik
* **tui:** handle raw control bytes in Kitty protocol parser ([d40fdb4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d40fdb4e7b2d643f3883be43d375cdbde621a32a)) by mltheuser.gitlab

### 📝 Documentation

* **sandbox:** add AGENTS.md for lib_sandbox package ([cc29521](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cc29521b6d1b8f3932cd782fa3fd46ffb244e807)) by Karl Jamoralin

### ⚡ Refactor

* **flow:** manage history placeholder at converter boundary ([9dc90ec](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9dc90ece134f60c155c2068bba29f47daba91d04)) by John Slaughter
* **sandbox:** Implement worker entry point and action handlers ([b3b8c72](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b3b8c72078468d9e3388fb995875cee13c00d7b4)) by Karl Jamoralin
* **sandbox:** make config types self-documenting and tighten AGENTS.md ([1245992](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1245992c44edeacc16bba8a0bfae013ea6ec321e)) by Karl Jamoralin
* switch workspace packages from lodash to lodash-es ([24a16b7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/24a16b73eacd58c11ac47fe2d91049200c53c54f)) by Elwyn Benson

### 🔁 Chore

* add customer consent for cli beta ([683e573](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/683e5738d0b4197844fb182a83dfb168ef0f319a)) by Tomas Vik
* **duo-agent-platform-v2:** enable project selector in dev mode ([1963201](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/196320179b3a329a00367b730e5f0987d86c7604)) by Juhee Lee
* npm audit fix ([1f8255e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1f8255efa63216d26bc34f247d0b9baed46e2cc3)) by Tomas Vik
* reuse mcp prewarm method in duo cli ([b8df2b5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b8df2b5fce755dffc748277aa44ebac375362761)) by Andrei Zubov
* setup for Duo Developer flow ([36d5962](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/36d5962ad9e8b89cd812901aaf8f382e38cf1082)) by Tomas Vik

## [8.86.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.85.1...v8.86.0) (2026-04-10)

### ✨ Features

* Send project_id on duo_workflows direct_access requests ([3e0f77a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3e0f77a8dc4fe24a2fc9900f917c385d3d858e1c)) by Dylan Bernardi

### 🐛 Bug Fixes

* reintroduce connection-type option to headles binary ([1722977](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1722977391cc64034f5345124be560f6dd7a35ae)) by Mikołaj Wawrzyniak

## [8.85.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.85.0...v8.85.1) (2026-04-10)

### 🔁 Chore

* add empty commit to trigger a release ([19b073c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/19b073cf0e280e236bb228dc45b2b2cf44e380f4)) by Tomas Vik

## [8.85.0](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/compare/v8.84.0...v8.85.0) (2026-04-10)

### ✨ Features

* update Agentic Chat input placeholders ([2a42de8](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/2a42de86b1ddd6b4a99475765e4ae18ebcb4a955)) by Olena Horal-Koretska

### 🐛 Bug Fixes

* add back token revoke call ([9bbf666](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/9bbf6663ce687a522710ce25ab6c12d1af25c0fb)) by Halil Coban
* allow cli-e2e-test to run in forked projects ([8348d91](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/8348d91981294a39ecc7a96f087437e7e103867b)) by Tristan Read
* **flow:** remove deprecated model config from prompt definitions ([40016a4](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/40016a4726e3f27ff5044b452f015cafc4732b22)) by John Slaughter
* **logging:** add browser entry point to prevent DI framework from bundling in webview ([97d2a0e](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/97d2a0e84da505aa73782feca659e14dbc08509f)) by John Slaughter
* move token cleanup to finally block ([2608307](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/260830718e535944baee88f492f6de1988de1ee9)) by Halil Coban
* revoke tokens in headless mode ([d952866](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/d952866641440a419a89fec1c7c5839590956780)) by Elwyn Benson

### ⚡ Refactor

* multi-entry package structure and bundler resolution ([0655ee5](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/0655ee5b6d507d58873ebbc04767bba54d5b9491)) by Elwyn Benson
* remove dead code after refactor ([1812be9](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/1812be97c2798a7dd81ed017ae99b452ac9d51d1)) by Elwyn Benson

## [8.84.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.83.0...v8.84.0) (2026-04-09)

### ⚠ BREAKING CHANGES

* The --connection-type CLI flag has been removed.

### ✨ Features

* **cli:** reformat thread conversation messages ([1298dc7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1298dc77c2ab48220aa830cb8cf481a62373e849)) by Austin Regnery

### 🐛 Bug Fixes

* **cli:** propagate baseUrl to ConfigService for correct Snowplow telemetry ([3d998a9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3d998a960e4da5cbe3ad79d2811b4302615f5875)) by Elwyn Benson
* **cli:** trigger tab to switch agent only on press in xterm.js ([8c1cf50](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8c1cf50232af851a100c01d455acd8fbe631fc2b)) by Anna Springfield
* replace self-referential imports with relative paths ([998456d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/998456d46531d400f9ff55060ec88cc906751275)) by Elwyn Benson

### ⚡ Refactor

* move createFallbackService from workflow-executor to @gitlab-org/core ([f3aa2cc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f3aa2cc042312f4bb67d8ff26e370bb4e7b318b2)) by Elwyn Benson
* **sandbox:** add SandboxedActionExecutor and SandboxAwareActionExecutorFactory ([#2068](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/issues/2068)) ([79fac6e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/79fac6ee2716ee22e3cb24bdf8a32dc377a60204)) by Karl Jamoralin

### 🔁 Chore

* add customer consent for cli beta ([0af5911](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0af5911e8bd5b585997b66dff88becf0e31f98b6)) by Tomas Vik
* add missing workspace dependencies across 16 packages ([ee459fd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ee459fdee1c71ed689c3021ce5f928a23e4121de)) by Elwyn Benson
* **cli:** Add SKIP_RIPGREP_BUNDLE env var to skip ripgrep bundling ([c7156b3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c7156b363d80faf5566e93320624e7990d26448f)) by Andrew Fontaine
* Remove `gRPC` connection option ([2a076ce](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2a076ce3e6b5e996e09e9235d248c5542148a8d3)) by Olena Horal-Koretska
* remove demo packages lib-pkg-1 and lib-pkg-2 ([c92c926](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c92c926c94c72eeecc87888c1cae71e827658e3b)) by Elwyn Benson

## [8.83.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.82.0...v8.83.0) (2026-04-07)

### ✨ Features

* **cli:** allow list for instances participating in beta ([ae7676c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ae7676c35766b346db58fb6c6cf62a092bbc14a4)) by Tomas Vik
* **duo-agent-platform-v2:** add model selector ([b132004](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b1320040916f7d3650d48ddaf09c02d085e7d8a6)) by Juhee Lee
* **flow:** responsive layout, unified toolbar, right-docked properties panel, status bar ([8b07768](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8b0776866e70146b21a536b6647073dd57bf9b3e)) by John Slaughter
* **skills:** Support global Agent Skills from user home directory ([69b5148](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/69b5148499431d4c6c48e4862751ad1c72b0af0a)) by Karl Jamoralin

### 🐛 Bug Fixes

* **dap:** remove server version checking in session-based tool approval ([657c189](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/657c189181cb286ba42533f9f34055b2ec5caf04)) by Anna Springfield

### 🔁 Chore

* Add telemetry for tool approvals ([e531b15](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e531b155bfbc92fb986c29ac4732ac35791e946b)) by Dylan Bernardi

## [8.82.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.81.0...v8.82.0) (2026-04-02)

### ✨ Features

* **cli:** HITL plan approval support for headless mode ([6e74c35](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6e74c3581e8365a8e9c679d577c24b70ebefc3f8)) by Elwyn Benson
* **cli:** improve input bar with agent-colored borders and session title ([2d489b3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2d489b3d81fc2320afc9209d2ac178a6663819da)) by Austin Regnery
* **flow:** fix workflow execution metadata, input forwarding, and ui_log_events derivation ([44e05da](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/44e05da751c8893458522a618dc6359ea0598def)) by John Slaughter

### 🐛 Bug Fixes

* **cli:** prevent visual duplication during terminal resize ([2709106](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2709106018b175adfa17d43238209440994e9c02)) by aregnery
* **mcp:** support spaces and special characters in server names via slug mapping ([3c8b397](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3c8b397b033422206e666c5665f58d629dc3aa4b)) by John Slaughter

### 📝 Documentation

* update Duo CLI readme to reflect beta status ([aa511a3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/aa511a3c8cff28a2723d0921709a151c7c72b04c)) by Uma Chandran

### 🔁 Chore

* **caps:** Remove excessive logging for capabilities ([c3481c3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c3481c3a31fe219dd78d5cb579570e52ab594b0c)) by Dylan Bernardi

## [8.81.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.80.0...v8.81.0) (2026-04-01)

### ✨ Features

* add client type headers to LS api client ([246fd9a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/246fd9af1b3ec759adf32095c6c00150af913ed1)) by Andrei Zubov
* Cancel command running in IDE terminal ([8032d5e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8032d5e60e616cedb126c129b0a39cb88114bd9e)) by Olena Horal-Koretska
* **cli:** Add skills slash command support to CLI ([1563044](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1563044be9bba7157f99bc028c71a1b97af5eae4)) by Erran Carey
* **cli:** gate startup on group beta/experimental features setting ([fb7a486](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/fb7a4860c92fec0a8bf117617bcc52adfb030836)) by Elwyn Benson
* **flow:** add variable discovery and autocomplete for agent and AI task nodes ([96417d0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/96417d001baebc4bc8ba3459318a369e329f48c1)) by John Slaughter
* **mcp:** Enable config management for tool approvals ([9b4b6b0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9b4b6b0b8e1e811bf3c16661ff1bdaec595dcf31)) by Dylan Bernardi

### 🐛 Bug Fixes

* **cli:** return null for getCommitHash on empty commit history ([458b0f4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/458b0f41f6be7e39df7de638dc222e2fe767a0f5)) by Javier Gonzalez
* resolve symlink path mismatch in assertValidRepoFile ([1a5fb04](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1a5fb04100833378777a5b000a3670f452364703)) by Norman Debald
* use rootFsPath to set workspaceFolderPath ([89735a2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/89735a2a859c5dcaf18e67ac9c23673fa219a97e)) by Juhee Lee

### 🔁 Chore

* disable indent eslint rule clashing with prettier ([e336cee](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e336cee8b57432e8bd1e79fe13d42aca1366f8cf)) by Juhee Lee

## [8.80.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.79.0...v8.80.0) (2026-03-27)

### ✨ Features

* Allow users to interrupt running command ([30addc9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/30addc96583f203d7629708cf161d0e8053d91d8)) by Olena Horal-Koretska
* **cli:** add feedback slash command ([9d4deb3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9d4deb3e0dfa63cb40b00f3cb8e2ec293a104baa)) by Anna Springfield
* **cli:** add session-scoped tool approval persistence ([cf879f3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cf879f35e4f9531c14eda0965a933fc7bfad3dbf)) by Anna Springfield
* **duo-agent-platform-v2:** pass selected project to workflow metadata ([5cd5e28](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5cd5e28cb811306422265c06c7f6b268eaaed1cb)) by Juhee Lee
* **flow:** add dagre-based automatic node layout utility ([1b4fa45](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1b4fa45cf690e250aeb29ba951cfdad47b0b8b08)) by John Slaughter
* **flow:** add themed graph action bar with canvas controls and coming soon placeholders ([6442fab](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6442fab8e585fca4a7e26af73a2f218a28277d42)) by John Slaughter

### 🐛 Bug Fixes

* **cli:** resolve symlinks in --cwd path to match git repo root ([84c7a4d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/84c7a4d95a7a37ac9c550ce715f607f2a65cc90d)) by Elwyn Benson
* disable DAP when Duo features are disabled ([b3629c8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b3629c80a0fc16184bd59a282d71e5acbeb6c88c)) by Laura Ionel
* Reduce logging, call direct_access on new session ([e867f4e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e867f4e18db491ea2bae9ffa45fecd181b949a26)) by Dylan Bernardi
* send empty goal on workflow retry to prevent duplicate responses ([aa4e906](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/aa4e90615650a0b77d187e7bfc6b9fc5815f0ddf)) by Elwyn Benson

### ⚡ Refactor

* **cli:** attach agent mode to tool approval actions ([e0f11ab](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e0f11ab959b04e1bad6c297eaa12cf7c7ec661fe)) by Elwyn Benson
* migrate src/node and src/browser to workspace packages ([58e7a80](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/58e7a80d022cce5f1bf69a10b52eba60384f4307)) by Tomas Vik
* Remove SlashCommandAction enum, use plain strings ([32fe841](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/32fe841a3ada06244c0ebbead68cf83f67d07e47)) by Tomas Vik
* **workflow:** extract tool approval utilities ([dd9093d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/dd9093d2bcbc930b71850d318d18026d59790b9d)) by Anna Springfield

### 🔁 Chore

* bundle "ripgrep" binary into CLI executable ([5af8184](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5af81841a354ade0d329acaca09b38b12709f52a)) by Olena Horal-Koretska
* Bundle "ripgrep" with SEA builds ([d1abd78](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d1abd7854f7d8e5468839186982e290fb7c68bbb)) by Olena Horal-Koretska
* Cache ripgrep binaries in CI ([e82b90a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e82b90ac0a7d206fa85dc0f571a4d8fbefeddacf)) by Olena Horal-Koretska
* **deps:** update dependency @gitlab/duo-ui to ^15.16.0 ([601d8f7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/601d8f7272c499b812c8d224c6359d01ac840136)) by Olena Horal-Koretska
* **duo-agent-platform-v2:** fix browser SyntaxError ([7087fb9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7087fb92ff436d6d131dbdb5153d3f4ddf0fb984)) by Juhee Lee
* **sandbox:** add worker RPC protocol, WorkerManager, and client sandbox setting ([#2068](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/issues/2068)) ([6108644](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/61086442937f7d240d97fb09ecbe98557f47eb70)) by Karl Jamoralin

## [8.79.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.78.0...v8.79.0) (2026-03-23)

### ✨ Features

* **cli:** adapt Duo CLI behavior for glab distribution ([54dc351](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/54dc351b76963cee34a5a322d58a88c51c39a301)) by Tomas Vik
* **cli:** add terminal progress reporting via OSC 9;4 escape sequences ([809a6dc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/809a6dc8be2b49d9f98c9ec6e93daa9c549d72e6)) by Elwyn Benson
* **dap:** Send tools to Approve for Session ([4dfb1aa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4dfb1aa88b1e14ca8805313664fe9ea4acdeb3ed)) by Dylan Bernardi
* **duo-agent-platform-v2:** add project selector ([f0fcb0c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f0fcb0c21bc1cfb52b217d9e2c72fafb55f9149d)) by Juhee Lee
* **duo-agent-platform:** stream workflow events to DAP v2 UI ([c8a4935](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c8a4935d9ce2853107c070f05e1f7711642acb47)) by Tristan Read
* **sandbox:** Define sandbox configuration schema ([4d4d391](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4d4d391775032913cb69ea1a581f364acf7f44af)) by Karl Jamoralin
* **telemetry:** update snowplow events routing based on instance info ([3f3c6f5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3f3c6f55f1a02398b3d62130b14fb703c4888e14)) by Mohammed Osumah
* **webview:** add reactive gitlab connection state ([cc1cc82](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cc1cc82d4ad13a64f16880a3cebb8130e90bd6bc)) by John Slaughter

### 🐛 Bug Fixes

* **cli:** add --minify to bun binary compilation ([5f4bc94](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5f4bc94695aaf28c3be300970e217f18592a08be)) by Andrew Fontaine
* **cli:** persist plan mode flow config across tool approval requests ([eba15ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/eba15ad8e190633a4f4d1c837e9fc110666e825f)) by Elwyn Benson
* emit WorkspaceFilesEvent when workspace folder is removed ([c721d59](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c721d590edc33bbdec522a38101246a3e309ff12)) by Juhee Lee
* Reduce feature state notifications in logs ([d471b06](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d471b06ebf5ad5a3d16670776fc2fe33acccaf5b)) by Dylan Bernardi
* remove stale lib-agentic-duo-chat dependency from lib_config ([3a5515a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3a5515af1013548ea7b5cc545039ca86e8b834b8)) by Tomas Vik
* switched run command string to args ([b0b16fe](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b0b16fe369dc0366da15fdce5689a8a8587cb615)) by Donald Cook

### ⚡ Refactor

* **cli:** extract prompt history management into PromptHistoryController ([3fefbbe](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3fefbbe165f80c32aa91062ae06819018cd9dd8e)) by Elwyn Benson
* **cli:** replace slash command callbacks with CommandComponentRegistry ([591c964](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/591c9647d73dbb2975d0d22fdd487d1c9eefe3cb)) by Anna Springfield
* extract AsyncIterator test helpers into @gitlab-org/test-utils ([ebfe5a2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ebfe5a2bb3886a8a1a6825437a099f5ff6a91039)) by Elwyn Benson
* migrate src/common to workspace package @gitlab-org/legacy-common ([a4fbcd8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a4fbcd8a7dc2ef5042ef43aa5191af2bdecf1705)) by Tomas Vik
* **workflow:** extract ActionExecutor abstraction (part 1 of [#2068](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/issues/2068)) ([573b350](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/573b35058d7c3aa65afb110c641e284429b44c43)) by Karl Jamoralin

### 🔁 Chore

* **cli:** allow SUPPORTED_TARGETS to be set externally ([64b6274](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/64b627445dc431c51b686aeb7418ea0fe0002625)) by Andrew Fontaine
* hide unchanged files from prettier output in fix-changed.sh ([6a85ee5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6a85ee56215469bdffda79853e459b2c82a0ee2d)) by Tomas Vik
* remove .tool-versions in favor of mise/config.toml ([1c90544](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1c90544d817f9843d946a3c21f251f8212aa56cf)) by Tomas Vik
* updates references to agentic and classic chat in copy ([1d46d33](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1d46d33f822ffd979a80c9210373c63c0bae29dc)) by Uma Chandran

## [8.78.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.77.0...v8.78.0) (2026-03-13)

### ✨ Features

* Package `ripgrep` with the LS ([8479f5a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8479f5ad55b9c2e46f7412f01976dac1da25ec75)) by Olena Horal-Koretska

### 🐛 Bug Fixes

* **cli:** use key.sequence for character insertion to fix Shift+numeric keys ([df2daff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/df2daff20bf2037a2c4b582aba9cd1ad8807da3a)) by Denys Mishunov
* **tui:** wrap long diff lines instead of overflowing terminal ([8a1682e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8a1682e32ab69e1b786f34c21b88e9d990b592df)) by Elwyn Benson

### 📝 Documentation

* revise Duo CLI documentation for development focus ([e5e3f21](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e5e3f21137437ae7b2e317692e75089b1159ae27)) by Tomas Vik

### ⚡ Refactor

* **cli:** avoid unnecessary tool approval round trips to server ([08f22d3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/08f22d32677f245483b0151ee4e7e7e43c1bafe6)) by Elwyn Benson
* **skills:** Add yaml parsing and zod schema validation ([eb2a3df](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/eb2a3df38db52f8717f98ce1e8ecb996b04c20d7)) by Erran Carey

## [8.77.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.76.0...v8.77.0) (2026-03-13)

### ✨ Features

* Add support for chunk reading to `read_file` tool ([9aa528c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9aa528c252b20a30895523f215e243d47a64a472)) by Olena Horal-Koretska
* **cli:** /copy command copies last Duo message to clipboard ([ef78c22](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ef78c2285e5b1cb2cd743f4fc3e3e89006d05e7b)) by Tomas Vik
* **cli:** add "plan" mode ([2971e3c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2971e3c98e7784b3088e7f1e9ae74cc061940e2f)) by Elwyn Benson
* **cli:** Add langsmithTrace support for distributed tracing in workflow clients ([042c54c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/042c54c1f25484f27082489204cf382ba0ba6cb2)) by Bruno Cardoso
* **cli:** add optional rejection reason to tool approval flow ([7188cf3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7188cf3bcdfa8988fd924689e106f15d4be1cfb7)) by Elwyn Benson
* **cli:** log run config consistently ([5c23f7f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5c23f7f10bf46e574786a40ad1756890232f3793)) by Elwyn Benson
* **cli:** track command type for duo CLI ([e445974](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e4459742d86987f0e4f7ec6cb475b21f4d67c0be)) by Andrei Zubov
* Enable chat on connection loss ([436a328](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/436a328f22ab2a4fbd5a770d78e798e9d1101dd6)) by Olena Horal-Koretska
* **flow:** decouple node identity + friendly display labels ([280fb2d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/280fb2d2af7ea14d53131e1dd0b731d03d2b6631)) by John Slaughter
* Handle chat errors ([40aa619](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/40aa61951adebb57f683cec57384719fa7fe4b7f)) by Olena Horal-Koretska
* **sandbox:** integrate srt SDK and add dependency detection ([e069a6f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e069a6fe0f9f9b1283a0bf1f3c11323d4b0f5ba1)) by Karl Jamoralin
* Use `ripgrep` for local search tool ([fac3db8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/fac3db89ce1e56a7074f7c15335d089a7bcbc7e6)) by Olena Horal-Koretska

### 🐛 Bug Fixes

* **cli:** submit on enter for slash commands ([52c04bb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/52c04bb8a0206eebe3bb87e3b2b28e7f9f07eee3)) by Anna Springfield
* resolve broken artifact link in publish-duo-cli-artifact job ([d455dfd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d455dfd90a87f65f83124bdea442ed86a6268b20)) by Olena Horal-Koretska

### ⚡ Refactor

* **cli:** add onActiveSessionChanged callback to SessionManager ([86cf959](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/86cf9594e0cbf6c95b428fb6e2c2d24ca728b88e)) by Elwyn Benson
* **cli:** change activeSessionChanged to event emitter ([f14f011](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f14f0114d5f83fdbad611448184295bc479e7bfe)) by Elwyn Benson
* **cli:** help dialog naming & keys tweaks ([661e21c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/661e21c158394bad82b764d45106f0334bc8a0d1)) by Anna Springfield
* **cli:** improve dropdown documentation and add defensive check ([b210341](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b210341f8c2820bf091e12258e41c3f122ca4635)) by Anna Springfield
* **cli:** introduce page object model for e2e tests ([14e309c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/14e309cfcfe00ac7bca1300a59dace1c35f17d29)) by Elwyn Benson

### ✅ Tests

* **cli:** add e2e tests for escape cancel, clean exit, and GITLAB_OAUTH_TOKEN auth ([1722a0c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1722a0cce9c80f942b8edbb1247724af2cffb033)) by Elwyn Benson
* **cli:** add e2e tests for prompt history navigation ([238af3e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/238af3ea0e0f5ae60ffcd4bc9ed8aed3d620c933)) by Elwyn Benson
* **cli:** add e2e tests for tool approval flow ([9243eb3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9243eb3d91a1599ed16d9c0657caa8c993e4d9bd)) by Elwyn Benson

### 🔁 Chore

* default to user GraphQL namespace ([b3f05b4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b3f05b42bc7bebfdaeb975d60fb85526cccfc94c)) by Laura Ionel
* filter out stub setup to avoid redundant WebviewController ([a3c55a2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a3c55a2b41c2ec9ae529b873c469b40657bab7b3)) by Juhee Lee

## [8.76.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.75.0...v8.76.0) (2026-03-10)

### ✨ Features

* add GraphQL default namespace fallback ([266d9c1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/266d9c133518db5b511b071a6b706e165de854f9)) by Laura Ionel
* **cli:** add /help slash command for interactive session ([ac06016](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ac060164ac8fdfc0d3c5c1f4fe4da1ffc8f4fa84)) by Anna Springfield
* **cli:** add model selection slash command ([acc3d38](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/acc3d388c7980bc1ab67acc72e9b109877bc2060)) by Andrei Zubov
* **cli:** expose the token source in TUI and error messages ([7c185c6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7c185c69cb7c1b3fcec851cdceaae021886f5aac)) by Tomas Vik
* **flow:** schema-driven tool configuration with parameter bindings ([6d5f87c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6d5f87c0e8be188126a445e70b599c928c86284c)) by John Slaughter
* Use aiChatIncludedProjects to fetch available repos for /include command ([9b519a3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9b519a3346a809be5f37a8726d4d5298a2909276)) by Anna Springfield

### 🐛 Bug Fixes

* add project_id, namespace_id, root_namespace_id as query params in WebSocket URL ([a9d4342](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a9d434264022d4ed7ed192826c3b6352d9293f4c)) by Max Fan
* **cli:** add waitForMatch guards to e2e tests to prevent race conditions ([a8f891d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a8f891df968257ba32468c9750d926380d145452)) by Elwyn Benson
* **cli:** prevent double key events in dropdown navigation ([450118f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/450118f91b2568cff5e6ea0d541388a63215f1df)) by Anna Springfield
* wrap shell commands in `sh -c` ([cdc19ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/cdc19ad3d454260f266c1c566fbb41c717b5c877)) by Donald Cook

### ⚡ Refactor

* **cli:** introduce DropdownProvider ([c7460ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c7460ad47a1fe7a8a3eb6cbe748f6a28c9feef83)) by Tomas Vik

## [8.75.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.74.0...v8.75.0) (2026-03-05)

### ✨ Features

* **workflow:** forward aiCatalogItemVersionId to runWorkflow ([fe121ed](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/fe121edcc41c9cfbdb2fc0e8803440beb3605fce)) by Igor Drozdov

### 🐛 Bug Fixes

* revert "feat: add duoDefaultNamespace from GraphQL" ([64d57b4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/64d57b444e619e08d0c8a88af90882010dfbae58)) by Tomas Vik

## [8.74.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.73.0...v8.74.0) (2026-03-05)

### ✨ Features

* add duoDefaultNamespace from GraphQL ([4217f99](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4217f9938002b9770c2ebf1756c0e467adea4235)) by Laura Ionel
* **cli:** --dangerously-skip-permissions flag ([ae6bea6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ae6bea60da15647e39b5b79abc0300079d578649)) by Tomas Vik
* **cli:** add environment data to DAU tracking ([5237c9e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5237c9ec3a6cbf781c51816fbdadaa1ec1a7f915)) by Andrei Zubov
* **cli:** track Duo turn cancellation ([40319d5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/40319d55bb5ad046fa86845c5f7de441e1530fdd)) by Tomas Vik

### 🐛 Bug Fixes

* check local duo settings before sending duo checks ([94e63c1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/94e63c164e12083a76dfedd2bbd469c9091a4ec5)) by Tristan Read
* **ci:** set integration-test-browser to allow_failure ([b876d2f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b876d2fd286c76d5ea602f9b2d5a958982fded9c)) by Tomas Vik
* **cli:** ensure config page cleans up correctly on exit ([2c880bf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2c880bfe130a9d834f757ad96032223e19492908)) by Elwyn Benson
* **tui:** clear prompt input immediately on submit ([783e121](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/783e1219c335413209473393c3d32cd1bd2d1a47)) by Elwyn Benson

### ⚡ Refactor

* **cli:** remove run_git_command from anthropic backend ([93d4882](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/93d4882caf7bb19e1f31910164dfa48a78ad5398)) by Tomas Vik

### ✅ Tests

* **cli:** improve e2e testing utils for debugging ([2813cf2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2813cf20172f43f7dea4a27b74754703c8140f6a)) by Tomas Vik

### 🔁 Chore

* add debug logging to integration browser test ([e1afaea](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e1afaeac673a36e7b07bda03b2891a01c427663d)) by Tristan Read
* ensure npm publish uses the gitlab-lsp registry ([15ba372](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/15ba372ab619b7d016954a7fa86c6d7581226f02)) by Tristan Read
* update security process to handle tags ([58309fd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/58309fd873a3a9651ae2b7237ffad69646e90ee1)) by Tristan Read

## [8.73.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.72.0...v8.73.0) (2026-03-04)

### ✨ Features

* **cli:** Reduce the number of spinners in the welcome screen ([8a7b47c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8a7b47cc3e0a3a3db4862c5d14bb0e49acfc0b3c)) by Andrei Zubov
* **skills:** support Agent Skills as slash commands and additional context ([595fbf9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/595fbf9214b2f1981f03c19ac3f54a55651a5c40)) by Erran Carey
* **workflow:** add ai_catalog_item_version_id to WS URL ([bfd71fe](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/bfd71fe8f21a15742f956977effe27597ae78460)) by Igor Drozdov

### 🐛 Bug Fixes

* **cli:** stability improvements for sessions e2e tests ([c9338dd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c9338dd020287916b9ca860c2e2d106024db62fa)) by Elwyn Benson

### ⚡ Refactor

* use composition over inheritance with Shell context providers ([8decfc4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8decfc414aab9f2a56c73531196282e71a901d36)) by Tomas Vik

### ✅ Tests

* **cli:** add prompt input navigation and editing e2e tests ([ec8b138](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ec8b13837524be2746dad7eb56ca9eff3978d4ec)) by Elwyn Benson
* fix flaky did_change_watched_files tests - wait for workspace init ([62268c3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/62268c3c0f70156cbbf6c438a55c28de9e5bfd9e)) by Elwyn Benson

## [8.72.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.71.0...v8.72.0) (2026-03-03)

### ✨ Features

* add shell context to Duo CLI sessions ([16714cc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/16714cc7f849aebb933cabac7038f3baab76c2a6)) by Tomas Vik
* **cli:** add MCP status indicator ([800d119](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/800d119bf137379930474a8a698fbc0c921eee91)) by Elwyn Benson
* **cli:** show usage cut off status ([1697572](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1697572a0862d3690fab455b435d0eafba61ad82)) by Andrei Zubov
* **dap-v2:** add agent message actions ([7bba1b0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7bba1b0bcaf241995570a4957ecd0ca8b5e120d5)) by Juhee Lee
* **flow:** introduce explicit input schema and visual START node ([3b359b4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3b359b48e605b15b9127cea7e0e67a7afe41de8d)) by John Slaughter
* show selected model in duo cli header ([2bee1af](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2bee1af3a3f3a6c48f737ecafcea7c10cb54c9f3)) by Andrei Zubov
* **tui:** add DropdownItem component for slash commands ([fa3dea9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/fa3dea91effab9efb448e63f09513fa7be2ca67d)) by Anna Springfield

### 🐛 Bug Fixes

* add "help" command to Duo CLI ([90a45de](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/90a45deca7f552c4a7f15b1da6ddb1be1bc5ba77)) by Andrei Zubov
* Add workflow_definition to the e2e tests ([8534886](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/85348868dbce8720d9b3ee32114d3217cc38f20f)) by Andras Herczeg
* **cli:** abort in-flight requests to prevent out-of-order responses ([8291c5b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8291c5bc019ead7f2b97152821a095a043dd6af2)) by Elwyn Benson
* **cli:** duo direct broken due to cyclic DI dependency ([927d713](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/927d7136b4ebc6e7fc5b8691a13e2e7bda58395d)) by Tomas Vik
* Remove usage quota loading flag ([4229ebb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4229ebbfff90cea2ebce6af8da92040cf2a78128)) by Olena Horal-Koretska
* **tui:** constrain prompt input to viewport height with scrolling ([7d3cef2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7d3cef28d2f3a5179f321ba7fd7df832013e34ff)) by Elwyn Benson

### ⚡ Refactor

* **tui:** extract SearchableList generic component ([0654333](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/06543336802e96668e9b1ff3d9fce261a9c61385)) by Elwyn Benson

### ✅ Tests

* **cli:** add e2e tests for session lifecycle and navigation ([087887c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/087887c67398f6d989d340a9031cb35226192b5a)) by Elwyn Benson
* **cli:** fix flow_definition to work with shell_command ([3c7089c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3c7089cea131176bce528615ba35e49ef99af3b7)) by Elwyn Benson

### 🔁 Chore

* **cli:** add cli-development skill ([1d71f21](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1d71f2135a29dbef464bb2d598841a1a1a48c55b)) by Tomas Vik
* **cli:** more verbose type for update checker result ([2364bfd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2364bfd9ed5bc484044c6ed1ec325a0eb13238db)) by Tomas Vik

## [8.71.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.70.0...v8.71.0) (2026-02-26)

### ✨ Features

* **flow:** add universal component picker with palette/shortcut and edge-drop node placement ([441dc15](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/441dc15e78a5f7d7a08cdfefa33098aa12debc03)) by John Slaughter

### 🐛 Bug Fixes

* **cli:** don't prevent underscore keypresses ([5f6bbd6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5f6bbd607e2d0977615ffd3c1f2aaedf310a9624)) by Elwyn Benson
* explicitly set credential helper rather than relying on default behaviour ([173ef78](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/173ef78cdea9e50f6caccd4e775ea7a63f0c593f)) by Andrei Zubov
* **tui:** lag spike on cli start no longer prevents typing ([486a338](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/486a33842a2d190f41c3a8cc3f3d2c602e8386fd)) by Elwyn Benson

### ⚡ Refactor

* **cli:** move endCursor pagination state from TUI type to controller ([7f51a56](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7f51a566a91e8d2450e849e4bf88d14ec8a02ed8)) by Elwyn Benson
* **cli:** move session callback ownership to SessionsHistoryController ([560ccaa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/560ccaacc07bca08a0a64a4df31eb63490ed3d97)) by Elwyn Benson

### ✅ Tests

* **tui:** replace jest forceExit with proper cleanup ([96b19f3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/96b19f322ee72f550d3b985cb4dac5bf20e74d4e)) by Elwyn Benson

### 🔁 Chore

* Remove legacy response field usage in tests ([618db38](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/618db389c89afe8ebef3f49d1c7907487aebe841)) by Halil Coban

## [8.70.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.69.0...v8.70.0) (2026-02-26)

### ✨ Features

* **cli:** add '/sessions' for accessing session history ([fb5ea1e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/fb5ea1ee7731cc91c2a557f1b8eaf8fc537489ba)) by Elwyn Benson
* **cli:** config screen improvements ([1b3d825](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1b3d82538822d6934a3abf7419b6e53cd429e509)) by Tomas Vik
* **cli:** session history data fetching ([e85e9ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e85e9ad05e507e961e246847dc563819e6230195)) by Elwyn Benson
* **cli:** simplify config screen ([34e299b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/34e299b7a577377ca6ebd0b983d7e8788602936d)) by Tomas Vik

### 🐛 Bug Fixes

* **cli:** prevent double key events in selections ([9cc74a7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9cc74a7651a7b7a4c243c9bbaf6d9a5d17868f22)) by Elwyn Benson
* don't consider commands failed for non-zero exit code ([3de5096](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3de50969e7fe8c2d6b921ab0c248879107d291ff)) by Elwyn Benson

### ⚡ Refactor

* **cli:** decouple sessions data service from backend ([1a6de62](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1a6de62cf7204b32afed9355155ff8e594aa39cc)) by Elwyn Benson

### 🔁 CI

* remove allow_failure from cli-headless-e2e-test ([159406c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/159406c2ec7146580b8dc44a9f041729a2fca2ee)) by Elwyn Benson

### 🔁 Chore

* disable tracking for e2e tests ([b1bb788](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b1bb7887476ded3dd797b13176de949587d0d3a2)) by Andrei Zubov
* remove agentic_chat_access checker ([11efa7e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/11efa7ebedb018b82ec5eeb0f4ece2cba95d449a)) by Andrei Zubov

## [8.69.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.68.0...v8.69.0) (2026-02-24)

### ✨ Features

* **cli:** glab OAuth credential refresh ([2295b16](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2295b16471714180ac149c6b83fa76d2d3fee345)) by Tomas Vik

### 🔁 Chore

* update --model help text to use gitlab_identifier format ([5341658](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5341658fef82fc996055d33ca66c980b4c62a321)) by Denys Mishunov

## [8.68.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.67.0...v8.68.0) (2026-02-23)

### ✨ Features

* Add `workflow_definition` param to user quota check ([57d81ae](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/57d81aef2ca49db9c1e03b613860604b2a061ef0)) by Olena Horal-Koretska
* add new message components for DAP v2 ([a257bc6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a257bc6bb73a3970a0ce85199c1d139743832fab)) by Juhee Lee
* **cli:** add slash command interfaces and service ([e997de5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e997de5db44f02af24435bf817b534a1314c1643)) by Anna Springfield
* **cli:** basic model selection ([2e96b0b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2e96b0b838ed3c78dbf8737900260091126be5b4)) by Tomas Vik
* Show error state in DAP when token gets invalid ([6353c22](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6353c22b2e48c9e63163c571c4e724d9dceab87e)) by Olena Horal-Koretska
* **webview:** add webview dev mode ([2a1ec89](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2a1ec8994ed52561b7866e42f75aa2abad0a965f)) by John Slaughter

### 🐛 Bug Fixes

* cap additional context id length to prevent GraphQL validation error ([71f3c66](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/71f3c66885c15ee4979bb3c1b63e5bbeeb3bac96)) by ŁUKASZ KORBASIEWICZ
* **cli:** \x1b\r handled as shift+return ([9907c3d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9907c3dbf4aafc0224ce5e0a037dd496d4a343e4)) by Tomas Vik
* Do not fail all context items when one fails ([32e141b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/32e141bf98847b7f9f646dc77e1681ae32fceca2)) by Olena Horal-Koretska
* implement async executor disposal ([f3cc196](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f3cc196dfff5b69313d6f22af10040e3f98473aa)) by Elwyn Benson
* Reset chat error on navigation ([b7f5228](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b7f5228392c29fb00d49630208c673ac20d799dc)) by Olena Horal-Koretska
* Reset state on FE when BE fails to do so ([461aa14](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/461aa140a9931a396bc479e49b866c56ac7cda7a)) by Olena Horal-Koretska

### 📝 Documentation

* DI skill ([1b0f118](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/1b0f1189db4752a0f8019cc70c8ced58d74bc616)) by Tomas Vik

### ⚡ Refactor

* **cli:** introduce RuntimeContext ([3268084](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3268084cddf13cdd4cb9277ed891fb54636b7c31)) by Tomas Vik
* **cli:** move backend service registration into BackendConfigAdapter ([d46f1bc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d46f1bc997be9ce7a954987c4fdea74c9b458dd8)) by Tomas Vik
* **cli:** parse and transform cli options usding zod schema ([6092f5b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6092f5b814e069c4be70780413dad70bb1770ac5)) by Tomas Vik
* **cli:** parse backend options separately ([307d84a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/307d84a9d4ad6457827317c01e2defcf792e5396)) by Tomas Vik
* **cli:** remove CliRunConfig ([96ffda0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/96ffda0f2da7bcff793ceaf928d4d535969403d3)) by Tomas Vik

### ✅ Tests

* **cli:** e2e tests print last 200 log lines on failure ([217c212](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/217c212e7aa04b7f85ee6f2f881e4d869d58ca2d)) by Tomas Vik
* simplify git integration tests to avoid CI timeouts ([c667999](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c667999aecd07a87f5f7c0a2ed63a6cccc8ef7a6)) by Tomas Vik

### 🔁 Chore

* **deps:** update dependency chai to ^6.2.2 ([081d1b6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/081d1b66b62302e6a71bdbb681b80865484ba463)) by GitLab Renovate Bot

## [8.67.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.66.0...v8.67.0) (2026-02-18)

### ✨ Features

* remove agentic platform ga rollout check ([35bdefd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/35bdefd926663fb48ccc610c0e51a001f901dc7a)) by Andrei Zubov

### 🐛 Bug Fixes

* Check Duo Feature Access state only when API is valid ([aee1068](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/aee1068bd86571aa8e4d6a7eb5c18a54a0f504a4)) by Olena Horal-Koretska

### ⚡ Refactor

* **cli:** duo direct to run anthropic backend ([6ce728a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6ce728aa82ccaa02c0af03ad9412b34eafd1ee9a)) by Tomas Vik
* **cli:** shared CLI options definition ([8d137d4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8d137d4b32887760c681dd6b0d53c50358467b55)) by Tomas Vik

### ✅ Tests

* **cli:** disable glab e2e test for now ([8f2b743](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8f2b74346e12f3e826b7eaa3079093daf96829c1)) by Tomas Vik
* increase timeout in integration-persistent-storage test to reduce flakiness ([3d6cc58](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3d6cc58452139b2153eb91ab0dc88b783a921ec9)) by Tomas Vik

### 🔁 Chore

* **cli:** update required glab version ([8232728](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8232728c4b0bd2235dd861b2afb7499f4eaa82ca)) by Tomas Vik

## [8.66.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.65.0...v8.66.0) (2026-02-16)

### ✨ Features

* add agentic chat support check to Duo CLI ([67c4552](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/67c4552c8769a4edc5fc68d7cae66bf776043f7c)) by Andrei Zubov
* **cli:** use glab for authentication ([d706491](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d706491305518dae2ae37a79de700da086aa92ad)) by Tomas Vik
* **flow:** populate tool registry with sample tool definitions from duo_workflow_service ([7deb070](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7deb07047dcc59f213504635c7a35cd918ad56d8)) by John Slaughter
* Pass `rootNamespaceId` when getting workflow token for CLI ([d10da93](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d10da9327e79fbe8d70ce7a91569099a0f7875cd)) by Olena Horal-Koretska
* persist user model selection via LSP workspace settings ([d37d7d5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d37d7d5d149f1e71f015fd4b627b366050bde1f7)) by Karl Jamoralin
* **token-validation:** accept ai_features and read_api scopes ([2c69a8d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2c69a8d676c70799a8c662f7a6bd5a85ab38a66e)) by Mohammed Osumah

### 🐛 Bug Fixes

* **auth:** don't make failing token check requests ([0434aa4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0434aa45805217e5d0119489eb70c2c51af53380)) by Tomas Vik
* **cli:** adjust version compatability for --use-system-ca ([7f40afc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7f40afc2dc725193e5220f4c37aa5474664d29de)) by Elwyn Benson
* **flow:** replace HTML5 drag-and-drop with pointer events for vscode webview compatibility ([701b60d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/701b60d92d8948195a832c64706d65af7f6cfb07)) by John Slaughter

### ✅ Tests

* **cli:** e2e test for authentication methods ([831aa3f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/831aa3fd49a007c5598fc3787e1140f0969b5d0a)) by Tomas Vik

### 🔁 Chore

* **deps:** update dependency @monyone/aho-corasick to ^1.1.6 ([a5742f7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a5742f73b2c278e92bc908c70acefd8a3159d69b)) by GitLab Renovate Bot
* **deps:** update dependency @parcel/watcher to ^2.5.6 ([8ee2eaa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8ee2eaa01b90b34dc57cce0f25990a72cdce980a)) by GitLab Renovate Bot
* **deps:** update dependency @snowplow/tracker-core to ^3.24.6 ([ce85df2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ce85df2ca434e10822cd305590f354663c9c18ae)) by GitLab Renovate Bot
* **deps:** update dependency @tailwindcss/vite to ^4.1.18 ([5d5f348](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5d5f348441317cf0a0d3e04c2e5bb17c9eb8bb91)) by GitLab Renovate Bot
* **deps:** update dependency lodash to ^4.17.23 ([6c5b0e2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6c5b0e2f81a5a08cf37364e80a26f6b9670e709c)) by GitLab Renovate Bot
* refactor ctrl+c handling in duo cli inputs ([ad92fc8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ad92fc8e801a2cabff8b4ed833453eac3dbc594a)) by Andrei Zubov
* update duo cli installation docs ([d19eb40](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d19eb40a8143d01270e09481482108d8e3a1a55b)) by Andrei Zubov

## [8.65.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.64.0...v8.65.0) (2026-02-11)

### ✨ Features

* **cli:** start new session with '/new' ([3d71567](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3d71567a4fec5aeeb780fc6441d95b9cae6e2d2f)) by Elwyn Benson

### 🐛 Bug Fixes

* dont expose host network to docker ([500b754](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/500b7544c48ec1ea54bd11bc24a2221c0b1856ed)) by Roman Eisner
* Set usage quota loading state to `[secure]` initially ([b3bc740](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b3bc7409e38a756c9fab57747741ef66856feee3)) by Olena Horal-Koretska

### ⚡ Refactor

* **cli:** Smart components with KeyHandler ([da1571f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/da1571f6ffb61569e072350912718190b99e3b0c)) by Tomas Vik
* Register `CodeSuggestionTelemetryState` with DI ([edd13e4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/edd13e47d4256445b02045f84fb09b71e433d363)) by Olena Horal-Koretska

### 🔁 Chore

* **deps:** update dependency highlight.js to ^11.11.1 ([7422511](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/7422511cc81cba71749d970f830a43bbb50b6556)) by GitLab Renovate Bot

## [8.64.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.63.0...v8.64.0) (2026-02-10)

### ✨ Features

* add git author params ([4a41793](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4a4179315224a33805aee17c1af66615b212039b)) by Roman Eisner
* **cli:** apply secret redaction to user prompts ([8e2c02b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8e2c02b82ffbb852f2ef58d8beb939a2d8d9b736)) by Elwyn Benson

## [8.63.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.62.2...v8.63.0) (2026-02-10)

### ✨ Features

* add support for self-signed certificates in Duo CLI ([f4fed09](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f4fed09b5296d666d2152f3acdba5bd5029e64de)) by Andrei Zubov
* **cli:** support custom SSL certificates ([266d49d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/266d49de9b5db1194e99aa550e4e148b59500871)) by Elwyn Benson
* **flow:** add JSON Schema support for node type definitions with mock schemas ([636ee2b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/636ee2b69dccbdb83bd41c395c5eaddd89e89784)) by John Slaughter
* history UI improvements ([201d522](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/201d522de5ae03f2b42da678007cbaf2a080a13a)) by Juhee Lee
* Provide `root_namespace_id` as param for `duo_workflows/direct_access` ([83c027c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/83c027c803a730b03cfd7d2c13d506a4a3401343)) by Olena Horal-Koretska

### 🐛 Bug Fixes

* **cli:** console.log during render redirects to our normal log file ([c8a6d14](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c8a6d14d87754ae61b364267308f74689888fdac)) by Tomas Vik
* Resolve shell context cwd for SEA binaries using workspaceFolders ([eee28bc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/eee28bcee7286c9fc5f7991e2f06b2f1ecea0432)) by Karl Jamoralin

### 📝 Documentation

* update Duo CLI readme with intro, set up, and link to user docs ([b93a9d9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b93a9d9f730dc6ec82aa9f7b693c873a17d0afa8)) by Uma Chandran

### ⚡ Refactor

* **cli:** add SessionManager ([800b85e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/800b85ec9973b0da0862f06fd55630fbd03ef473)) by Elwyn Benson
* **cli:** consolidate input handling, tests, small fixes ([9a0accb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9a0accb8012b5e1e2f402f8607858a6c990359cb)) by Tomas Vik
* **cli:** improve message completion clarity ([656cb7f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/656cb7f9e40b5ed81bec43f3c662ec359f00efe1)) by Elwyn Benson

### 🔁 Chore

* add graph traversal utilities for flow analysis ([0c4c076](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0c4c076c6152e20408bf599c34f4378bdfeb3ed1)) by John Slaughter
* Add token reset log ([e61d807](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e61d8079317e3600a2d7106224acee006b8ffeef)) by Olena Horal-Koretska
* **deps:** update dependency @gitlab/eslint-plugin to ^21.3.1 ([2c9df05](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2c9df055c47d816dd94d64ca0bc3ce90bb4e563d)) by GitLab Renovate Bot
* **deps:** update dependency esbuild to ^0.27.3 ([0791c24](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0791c245958d35d1ffc92adbab8a00a786f62862)) by GitLab Dependency Bot
* initial AI tooling for LS ([f75e6d1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f75e6d14678814878c42d82defe2930751cec935)) by Tomas Vik
* simplify Duo Chat credits message ([d2bea1a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d2bea1a663accaae69a392f23bd6ca34af65948f)) by Uma Chandran

## [8.62.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.62.1...v8.62.2) (2026-02-05)

### 🐛 Bug Fixes

* ensure proxy settings are applied to WebSocket connections ([627109c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/627109c3850381f483de00a8114e5e2eeb5d505c)) by Tristan Read

## [8.62.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.62.0...v8.62.1) (2026-02-04)

### 🐛 Bug Fixes

* **cli:** ensure completed message events yield correctly ([749a13b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/749a13b43a41f7ebc1488decade03b3ae4b3cc99)) by Elwyn Benson
* **cli:** remove punycode deprecation warning on startup ([35174e3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/35174e38219a08bb048648dec60a9483827fa8a1)) by Tomas Vik

### 🔁 Chore

* **deps:** update dependency @gitlab/duo-ui to ^15.8.3 ([66df7f6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/66df7f6c66405a307b524386d70159ecc168e74f)) by Olena Horal-Koretska

## [8.62.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.61.1...v8.62.0) (2026-02-04)

### ✨ Features

* add daily active users tracking in duo CLI ([21b39c9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/21b39c9fd46e6f969b3223d0c3eeabeacc8d2cdf)) by Andrei Zubov

### 🐛 Bug Fixes

* **cli:** handle shell command actions in UI ([dc2786d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/dc2786d34727995c5996f54a2d2a7332ef58eaad)) by Elwyn Benson
* **cli:** redirect mcp server stderr to log file ([232f990](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/232f9900c4534e77ba6f2c69f6d483d3e621fe24)) by Elwyn Benson
* **duo-chat:** prevent WebSocket connection leaks with ChatSubscription lifecycle management ([bade890](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/bade89059997609c3d9692a2f6ba02b4e9607208)) by John Slaughter

### ⚡ Refactor

* **cli:** move backend creation from DI to factories ([12e4044](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/12e404403b97e75e1f84743f80b615a0116398e1)) by Elwyn Benson

### 🔁 Chore

* **cli:** Unify Duo CLI input handling ([d16d39b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d16d39b38b79912310ac48eec5a05ea49b8cb696)) by Tomas Vik

## [8.61.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.61.0...v8.61.1) (2026-02-03)

### 🐛 Bug Fixes

* **cli:** centralise exit handler, dispose DI container ([0cefe4a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0cefe4ab38ed5df2c6510bd0aeec197358d6de22)) by Elwyn Benson
* **cli:** use valid token for git tool with anthriopic backend ([adf4959](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/adf4959b302ae7f3938c11ae66551581240ed8ba)) by Elwyn Benson

### ✅ Tests

* **cli:** e2e tests use tmux rather than node-pty ([6a4d352](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/6a4d35215dcb09b82d801c88318aea2d6ccbd821)) by Tomas Vik

## [8.61.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.60.0...v8.61.0) (2026-02-01)

### ✨ Features

* add search and infinite scrolling ([4b72540](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4b72540eba1c778d00691293bf9be99956f84597)) by Juhee Lee

### 🐛 Bug Fixes

* **cli:** dont throttle initial loading state ([342cf0e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/342cf0e7faa915c67e5886cf9c11d36876231327)) by Elwyn Benson
* **cli:** handle empty flow-config value to prevent EISDIR error ([d82e798](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d82e7982067bacd97d9473a97384d929b61acb03)) by Falko Sieverding
* **mcp:** skip external MCP servers in sandbox mode ([2e1ab53](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2e1ab5392dd396d81b8e47017cc74d400f9616a1)) by Falko Sieverding

### ⚡ Refactor

* **cli:** invert existing-session-id usage ([3ad92d9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3ad92d9038f6a741a712cb42019db66a73bed7a1)) by Elwyn Benson
* **flow:** split monolithic flowStore into focused stores with coordination composable ([e29e33f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e29e33f58ff300a6318f07797013587ba4048092)) by John Slaughter

### ✅ Tests

* **cli:** First iteration of interactive Duo CLI E2E tests ([e8c81b3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e8c81b342da538a05049a03e1dcf42b0f77a86f7)) by Tomas Vik

### 🔁 Chore

* extract common tracking logic to telemetry package ([936b332](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/936b3324186e44f011263534ad3fac42a7b0f7f9)) by Andrei Zubov
* rename workflow extension ([37aef12](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/37aef121f7f4b359564582fb62c69164af346033)) by Uma Chandran

## [8.60.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.59.1...v8.60.0) (2026-01-29)

### ✨ Features

* display language server logs in output channel for webide ([a55bbcf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a55bbcf33b957069b30c583387df8b823599e8ed)) by Mohammed Osumah

### 🐛 Bug Fixes

* **cli:** use gitlab.com as a default GitLab URL ([31f9bda](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/31f9bda14f711eeaf77997e4461481b8e7aa1be5)) by Tomas Vik
* fail create_file_with_contents when file exists ([fe41607](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/fe41607396b15f9c3ef9f2c3ce94894c525a794e)) by Eva Kadlecová
* Fix race condition between CS requested and following events ([5552075](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5552075535583f0beb040cab488723c154a42c85)) by Olena Horal-Koretska

### ⚡ Refactor

* **cli:** extract session state from controller ([2f77dff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2f77dff4b870cdf5d35442da56ff4207cd81f5a3)) by Elwyn Benson

### ✅ Tests

* **cli:** add integration test for update check ([54498cd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/54498cdb35105edc574c5a43fc72cf99047417ed)) by Elwyn Benson
* **cli:** disable local MCP servers in integration tests ([4d9bbbf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4d9bbbfd0a61fc81e0bccf9f33778946f77bfe35)) by Elwyn Benson

### 🔁 Chore

* **cli:** improve invalid_token error message ([71a11e6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/71a11e6a3a65cd060a8e82596e506e6ef3e383a7)) by Elwyn Benson
* **cli:** mark mid-stream assistant messages as complete ([404c885](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/404c885d5306ed0a9a9889b83a37d762c50e1f83)) by Tomas Vik

## [8.59.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.59.0...v8.59.1) (2026-01-27)

### 🐛 Bug Fixes

* force trigger re-release take 2 ([054060a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/054060a55df26a14775bffdf93dddea9bbcc288c)) by Elwyn Benson

## [8.59.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.58.1...v8.59.0) (2026-01-27)

### ✨ Features

* add delete workflow functionality ([e20f66f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e20f66f2196c1bf97b56896ecf27990989f41cb0)) by Juhee Lee
* **cli:** notify user if updates are available ([a6b2bef](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a6b2befca76af5df467614e7922873e6c4a5ef9c)) by Elwyn Benson
* **repository:** support git worktrees ([3722b47](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3722b47d8e46f06ca9b159816d9797c5c28afa81)) by Benjamin Staneck

### 🐛 Bug Fixes

* **cli:** force trigger a re-release ([df3fad0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/df3fad004d5017b92d7990cc12b9fef89bbf5e0d)) by Elwyn Benson
* **cli:** handle delete and backspace correctly ([5573dc3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/5573dc34e65710234d38488e82db7c455a8ad7e2)) by Anna Springfield
* **cli:** make all completed messages static to improve typing performance ([bd02b7e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/bd02b7eeba43f1e095d1a144dc954fa5e1ad2bd1)) by Tomas Vik
* **cli:** reduce the message streaming to 2fps to prevent flicker ([3ba293c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3ba293c0e0f24fae38c281301d79ec66f420e7d7)) by Tomas Vik
* **cli:** restore terminal title on exit ([acc84f0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/acc84f01c6cca937d70c48d6db6aee68970680e4)) by Elwyn Benson
* **cli:** slow down the loading spinner to reduce terminal flicker ([2971803](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/29718032a6acc2309b936cdcdfe568182a6ff7e6)) by Tomas Vik
* **cli:** throttle fps globally for CLI to prevent flicker ([a9c4ba1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/a9c4ba19c03515cc14e7c24c0ec0a9afbb06d884)) by Tomas Vik
* dont log action handler output ([2081ff6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/2081ff6f06369257a61dc5f227ed3936653be0ed)) by Elwyn Benson
* **flow:** align client schema with v1 backend pydantic models ([c5dfc0d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c5dfc0da6331a8cadd8097d908c6063790948dea)) by John Slaughter

### ⚡ Refactor

* **cli:** move welcome message out of session state ([802c253](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/802c25322444235baa6c65f44a1e9c9a9c23cb57)) by Elwyn Benson

### ✅ Tests

* **cli:** add unit tests for run_controller ([4abc9ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/4abc9ad8afd5aa9baa14e26ec7681c97f62074a5)) by Elwyn Benson

### 🔁 Chore

* add duo install scripts for osx, linux and windows ([375263c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/375263c06f53213ab0cf75113c20e277fa3e6874)) by Andrei Zubov
* **cli:** restrict <Static> syntax ([3e4c7b0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3e4c7b0d108b623644ffebd378cf6b22d928b030)) by Tomas Vik
* extract MCP manager out of TUI controller ([310765e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/310765ef0f815a0e724d469153230adb582e9d7e)) by Tomas Vik
* improve security mirror manual sync steps ([e14fe50](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e14fe50654f2149ea8765947249c3a79ec676310)) by Tristan Read
* **release:** 8.59.0 [skip ci] ([92a5128](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/92a512873fc4bb729b5a9a86206fb1bcdbcd415c)) by semantic-release-bot
* remove dead telemetry code in DesktopWorkflowRunner ([b2bd9e6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b2bd9e600b66aebe348d18e501008564f075d343)) by Tomas Vik

## [8.59.0](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/compare/v8.58.1...v8.59.0) (2026-01-26)

### ✨ Features

* add delete workflow functionality ([e20f66f](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/e20f66f2196c1bf97b56896ecf27990989f41cb0)) by Juhee Lee
* **cli:** notify user if updates are available ([a6b2bef](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/a6b2befca76af5df467614e7922873e6c4a5ef9c)) by Elwyn Benson
* **repository:** support git worktrees ([3722b47](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/3722b47d8e46f06ca9b159816d9797c5c28afa81)) by Benjamin Staneck

### 🐛 Bug Fixes

* **cli:** handle delete and backspace correctly ([5573dc3](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/5573dc34e65710234d38488e82db7c455a8ad7e2)) by Anna Springfield
* **cli:** make all completed messages static to improve typing performance ([bd02b7e](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/bd02b7eeba43f1e095d1a144dc954fa5e1ad2bd1)) by Tomas Vik
* **cli:** reduce the message streaming to 2fps to prevent flicker ([3ba293c](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/3ba293c0e0f24fae38c281301d79ec66f420e7d7)) by Tomas Vik
* **cli:** restore terminal title on exit ([acc84f0](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/acc84f01c6cca937d70c48d6db6aee68970680e4)) by Elwyn Benson
* **cli:** slow down the loading spinner to reduce terminal flicker ([2971803](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/29718032a6acc2309b936cdcdfe568182a6ff7e6)) by Tomas Vik
* **cli:** throttle fps globally for CLI to prevent flicker ([a9c4ba1](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/a9c4ba19c03515cc14e7c24c0ec0a9afbb06d884)) by Tomas Vik
* dont log action handler output ([2081ff6](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/2081ff6f06369257a61dc5f227ed3936653be0ed)) by Elwyn Benson
* **flow:** align client schema with v1 backend pydantic models ([c5dfc0d](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/c5dfc0da6331a8cadd8097d908c6063790948dea)) by John Slaughter

### ⚡ Refactor

* **cli:** move welcome message out of session state ([802c253](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/802c25322444235baa6c65f44a1e9c9a9c23cb57)) by Elwyn Benson

### ✅ Tests

* **cli:** add unit tests for run_controller ([4abc9ad](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/4abc9ad8afd5aa9baa14e26ec7681c97f62074a5)) by Elwyn Benson

### 🔁 Chore

* add duo install scripts for osx, linux and windows ([375263c](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/375263c06f53213ab0cf75113c20e277fa3e6874)) by Andrei Zubov
* **cli:** restrict <Static> syntax ([3e4c7b0](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/3e4c7b0d108b623644ffebd378cf6b22d928b030)) by Tomas Vik
* extract MCP manager out of TUI controller ([310765e](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/310765ef0f815a0e724d469153230adb582e9d7e)) by Tomas Vik
* improve security mirror manual sync steps ([e14fe50](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/e14fe50654f2149ea8765947249c3a79ec676310)) by Tristan Read
* remove dead telemetry code in DesktopWorkflowRunner ([b2bd9e6](https://gitlab.com/gitlab-org/security/editor-extensions/gitlab-lsp/commit/b2bd9e600b66aebe348d18e501008564f075d343)) by Tomas Vik

## [8.58.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.58.0...v8.58.1) (2026-01-20)

### 🐛 Bug Fixes

* ensure file read errors correctly bubble up ([8ce7224](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/8ce72241a210d0162a131c80e26c390831f3a303)) by Elwyn Benson

### 🔁 Chore

* add storybook interaction tests for packages/webview ([3bf9ada](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3bf9ada5261102b3976fddc16e59b1b42d646910)) by Juhee Lee
* build duo CLI binaries in ci ([3c5d093](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/3c5d093b9c57842ca837025387a51e6207249f2f)) by Andrei Zubov

## [8.58.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/compare/v8.57.1...v8.58.0) (2026-01-19)

### ✨ Features

* Remove tab hiding logic ([deb3409](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/deb34093d1b7f99a03f6eb39faf74a5f5391dc44)) by Olena Horal-Koretska
* **tui:** file fuzzy search + add file content to message ([11af1a3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/11af1a35f370d1c817bc345176dfcdbe5596e314)) by Elwyn Benson

### 🐛 Bug Fixes

* allow patch releases for chore-only changes ([b466828](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b466828b0f94a6d885236cc6751db70c45b4f3d7)) by Tristan Read
* Fix pending message reset ([b06074c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b06074ca0bd7ef6dc788e81c1a037dba5180892c)) by Olena Horal-Koretska
* small memory leak due to event listener not being cleaned up ([62841f4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/62841f4d4f5f126e14bf65503ccff6f8506266b0)) by Elwyn Benson

### ⚡ Refactor

* **cli:** extract header component ([05a1294](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/05a1294fac22ff1faaf2df8ffcb38f0cc0928ddd)) by Tomas Vik
* **cli:** instantiate controllers via DI ([b67d183](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/b67d1837d35da623333054094f03558c676c3880)) by Elwyn Benson

### ✅ Tests

* **cli:** add e2e tests ([ff78517](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/ff7851709e2ac7903abc2f30bf601f0f59ab0512)) by Elwyn Benson
* summarise integration test failures in output ([bf98fb6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/bf98fb69f646a3d79139701bfcd342ad2f4179b6)) by Elwyn Benson
* use real rpc message sender in tests ([484ee10](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/484ee10a090941680336ef9cde5e5c2a2fcdb313)) by Elwyn Benson

### 🔁 Chore

* **cli:** add file context provider ([001908e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/001908e6d0cb67a52b5e49317a35a251a1c2d3d9)) by Elwyn Benson
* **cli:** enable sourcemaps in debug mode ([0e0ec16](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/0e0ec16659c14ca27464dfff000ec2d005c914a3)) by Tomas Vik
* **cli:** open devtools automatically when running `watch:tools` ([e305f6f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/e305f6fd8e6848f1cfd686de0360b3e2f4912859)) by Elwyn Benson
* delete old flow code ([598493e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/598493ec8ff454471f30b316ddfa51683e08a2f1)) by Andrew Fontaine
* **deps:** update dependency @gitlab/duo-ui to ^15.5.1 ([98eeeb9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/98eeeb94aad2a7a7be98ba3391b754c06d4d26a7)) by Olena Horal-Koretska
* prevent dangerbot from running on mirror fork MRs ([120df7b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/120df7b92beaa796641d2a9d337d4050bcf7c1aa)) by Tristan Read
* require node version 20 or higher to run Duo CLI ([f42c1b8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/f42c1b87ef739a17119f06a7c1ca3488791a55ec)) by Tomas Vik
* update ci config to handle alternate repos ([d4b645c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/d4b645cf34836916f7f25abc9124e76ec8684cda)) by Tristan Read
* update docs link in CLI for setting namespace ([776f18b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/776f18bf27fd474d90bfd6e29e1b7c41b8b966ea)) by Uma Chandran
* update gitleaks rules and rule evaluation process ([da7018b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/da7018bd15be8a8c94b2c4b8db9ebf58f5b1f23a)) by Elwyn Benson
* update security mirror process ([9977419](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/9977419a753d2caea4ca7eb5cc4aa32ed4d2fd34)) by Tristan Read
* update user-facing state labels to match style guide ([c683a30](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/commit/c683a30ce2a88fc62ead49422b5ebed40e950e80)) by Uma Chandran

## [8.57.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.57.0...v8.57.1) (2026-01-08)

### 🐛 Bug Fixes

* Add refresh functionality for the mid-stream cutoff message ([a18ea6f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a18ea6f4ddda919b0d5085fa9593289fd067812c)) by Olena Horal-Koretska
* remove AGENTIC_PLATFORM_GA_ROLLOUT_FLAG_DISABLED from AGENT_PLATFORM_CHECKS ([4bf4e28](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4bf4e28751f0aeec90cf234b48a6ed26e4c705e6)) by Andrei Zubov

## [8.57.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.56.0...v8.57.0) (2026-01-07)

### ✨ Features

* Add "Reload extension" button to usage quota check alert ([838679e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/838679e562d79e3ddb90ea42bd43e5d2076f4f79)) by Olena Horal-Koretska
* add agent_platform_ga_rollout check ([5f091b9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5f091b9f28114d337c9500bc31c82502a3139fe9)) by Andrei Zubov
* **cli:** add Opus 4.5 support to experimental anthropic backend ([2cb34a8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2cb34a8ad231447b5e3d27d53d770bb490bcd429)) by Elwyn Benson
* **cli:** allow passing file path for flow config ([bd26e6a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bd26e6a0c04372ed35e9e1033651195bb6a273cd)) by Elwyn Benson
* **cli:** allow running outside gitlab project repos ([ea85e3c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ea85e3c9f020a644a1cd950d470567c8aa34d439)) by Elwyn Benson
* update history UI ([7e3869f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7e3869fe2bf7abfbbcf5716f1bd371db43f0e056)) by Juhee Lee

### 🐛 Bug Fixes

* ensure shell commands use integrated IDE terminal ([dab87d3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/dab87d373f96e87561e1a2de039a368766ac88d5)) by Elwyn Benson
* use rootNamespaceId to fetch available models ([5021541](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/502154154ce7ecf947e5360ab2c557e6f90fcefb)) by Juhee Lee

### 📝 Documentation

* add security process docs ([9070258](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9070258f93f8ef185461127405809e941962e7b9)) by Elwyn Benson

### 🔁 Chore

* adjust mcp config file log to clarify missing vs error ([8b69812](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8b698124ba695ba61f6d8398843f10902691551f)) by Elwyn Benson
* followup to add code comment ([80d24fd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/80d24fd4a0a214ff443955d7f678c3e1e8223c8e)) by Elwyn Benson

## [8.56.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.55.0...v8.56.0) (2026-01-04)

### ✨ Features

* **cli:** restyle remaining tool messages ([48902bd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/48902bddeff397d1acdcf82d714a62b2a9be06d0)) by Elwyn Benson

### 📝 Documentation

* update markdown files to replace `Duo` with `GitLab Duo` ([0d6c2df](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0d6c2df937337c4759ac3f2a009afcd2756d0ac9)) by Uma Chandran

### ✅ Tests

* **cli:** add unit tests for tool components ([2294320](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2294320a9dc427906fcf1f6c9be9b7908b4d2395)) by Elwyn Benson

### 🔁 Chore

* **cli:** swap command tool in experimental anthropic backend ([542f5a5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/542f5a5f015376981a17fb9109f645087378519a)) by Elwyn Benson
* update duo-cli readme with experimental disclaimer ([6999f16](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6999f160eea3c29b507d3b5e46ff8ff4e0d1c801)) by Andrei Zubov

## [8.55.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.54.0...v8.55.0) (2025-12-22)

### ✨ Features

* add ability to get git status of current repo ([2bb1c34](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2bb1c34f553068cf1d1880f159a2888311a014d4)) by Elwyn Benson
* limit project selector size and wrap navigation bar on narrow panels ([624fbdc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/624fbdcff522ea80b626adc89b89b07fb9ba41d9)) by Enrique Alcántara
* **mcp:** Allow CRUD operations to MCP dashboard ([3d6e655](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3d6e655e6ef9c33d89ddf94d1dcb42536aa3f7d4)) by Dylan Bernardi
* Support code suggestions end-user usage cutoff ([c738cd8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c738cd897a6bc3b104d3d937cc59a4a83af3f78a)) by Mohammed Osumah

### 📝 Documentation

* add community contributor attribution to release process docs ([0d082b1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0d082b129df2214ffead06e81e95250253f570ae)) by Elwyn Benson

### ⚡ Refactor

* simplify script type handling in sync load scripts plugin ([970a533](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/970a533d99dac44a83eb89178578765ef68a9a9d)) by Enrique Alcántara

### 🔁 Chore

* **deps:** update dependency @types/lodash to ^4.17.21 ([0c041e7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0c041e7ad864853b5c761b915abcde3ecc81e323)) by GitLab Renovate Bot
* improve LLM handling of redacted content ([34887c0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/34887c044fcaed0a915559b31ab38be2c8787767)) by Elwyn Benson

## [8.54.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.53.2...v8.54.0) (2025-12-18)

### ✨ Features

* Improve syntax highlight on code blocks ([ddd2161](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ddd216174db93280692fcd53dfbac05b2cfd99fe)) by Enrique Alcántara

### 🐛 Bug Fixes

* Create workflow with project_id OR namespace_id (mutually exclusive) ([510a064](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/510a064a5d62d3353cd34cc2a7b450b250734c9c)) by Olena Horal-Koretska

## [8.53.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.53.1...v8.53.2) (2025-12-17)

### 🐛 Bug Fixes

* **chat:** Fix resizing panel bug ([0a02726](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0a02726ee54159079a22032bfbccd841447e416a)) by Enrique Alcantara

## [8.53.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.53.0...v8.53.1) (2025-12-17)

### 🐛 Bug Fixes

* Fix timing issue with project selector ([e207290](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e207290241a761053dba63f30c5368ebf37ac370)) by Olena Horal-Koretska
* Improve navigation bar positioning ([abb421b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/abb421b5776f2d0b994bea7f4028a29b0ba12db2)) by Enrique Alcántara
* **repository:** ignore git worktree metadata ([0631987](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0631987806ddb7302633b59f5448c917748192bd)). Fixed by community contributor [@b.staneck](https://gitlab.com/b.staneck) with [MR !2669](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/2669) 🎉

### ⚡ Refactor

* extract `DefaultChatContextManager` to workspace package ([0dc94f8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0dc94f8707daea1fad0ad591026cf69f6c9a66be)) by Elwyn Benson
* extract AIContextProvider base class to workspace package ([cd32e36](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cd32e360156d9c5b8bdcb0fc41e2e91358ea5cf0)) by Elwyn Benson

### 🔁 Chore

* **cli:** add `CLIAiContextManager` implementation ([1d775c7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1d775c7fccb19871c32697be52254ff6ceea7071)) by Elwyn Benson
* **deps:** update `ink` to 6.5.1 ([5f37916](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5f3791669de432616432cf0010cefa0f643bc103)) by Elwyn Benson
* **deps:** update dependency semver to ^7.7.3 ([6295191](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/629519180bf0832121bdd9893a1c218697b1a78f)) by GitLab Renovate Bot

## [8.53.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.52.0...v8.53.0) (2025-12-15)

### ✨ Features

* **cli:** prompt history backsearch ([24ed5b3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/24ed5b314c5a343765e0fddcd7726b32c1f4572b)) by Elwyn Benson
* load workflow history ([423feb3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/423feb3d4e09fe42ffd1fba5116aea2d51c54467)) by Juhee Lee
* Support mid chat end-user usage cutoff experience ([89962ab](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/89962ab5174d4c8dfc991ef8b29bc70796f9adde)) by Olena Horal-Koretska
* Support multiple websocket connection ([55e770f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/55e770f89e1d3e9045c3a271f1a328476d308d37)) by Frédéric Caplette
* Support new chat end-user usage cutoff experience ([8b8436e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8b8436e5348a9882b2807887a63ff0da4a7a3c9c)) by Olena Horal-Koretska

### 🐛 Bug Fixes

* **cli:** file search arrow key double events ([280a541](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/280a5419666d01cfe58667fb3b2e996eb379419e)) by Elwyn Benson

### ✅ Tests

* **cli:** fix flakey CLI test ([e5090b1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e5090b1b01b0b1a10a65342451dcf5a52243ead4)) by Elwyn Benson

### 🔁 Chore

* Abstract util function for connection states ([5c95640](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5c956404dc8eed9183f85584654d08d27d9134b3)) by Dylan Bernardi
* **cli:** add simple AGENTS.mds to cli packages ([55ae50b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/55ae50b292a07af682628502738c7888b57f6d50)) by Elwyn Benson
* **cli:** use websockets by default in CLI ([0e10e5c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0e10e5c8cc4eaa572933c5e9ddb052faee68ab2e)) by Elwyn Benson
* **deps:** update dependency commander to ^14.0.2 ([45571d5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/45571d5332a528fb65a7ec04ac21a720863d8ef9)) by GitLab Renovate Bot

## [8.52.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.51.0...v8.52.0) (2025-12-10)

### ✨ Features

* **flow:** flow execution infrastructure ([c1d34e6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c1d34e6c02e703628160bf99e57f92f77e734e70)) by John Slaughter
* Run workflow with selected project ([19e99b0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/19e99b0072816cc3fbc8bf7a7b3a35570ee5f675)) by Olena Horal-Koretska

### 🐛 Bug Fixes

* **cli:** set restrictive file permissions (0600) on storage.json ([0db1c5d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0db1c5dba26731f13f9c2fe932e194c73b8555a1)) by dappelt

### ⚡ Refactor

* consistently set file mode when writing the file instead of using chmod ([eda1c2a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/eda1c2ac114534dc75646f591e2e4b8ef3afe39a)) by dappelt

### ✅ Tests

* expect writeFile to be called with file mode ([8076b76](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8076b76119972cddfb39fd7643414917e60f82b7)) by dappelt
* Improve file permission tests to run on Windows ([4a5d29c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4a5d29cbfbb4b514c1ef68e1a8353d5128b86f6c)) by dappelt

### 🔁 Chore

* Apply 1 suggestion(s) to 1 file(s) ([fec511a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fec511a86cedf61cb549f44c9b980b1778b67630)) by Dennis Appelt

## [8.51.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.50.1...v8.51.0) (2025-12-09)

### ✨ Features

* add BM25 ranking and context grouping for grep search results ([3ec50aa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3ec50aa6d3e46c8a147ed0104cb22b42447efca8)) by Alexander Chueshev
* Add project selector component ([68345ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/68345ad316ee19d36e5c60df0215a46207236be9)) by Olena Horal-Koretska
* **cli:** initial restyling of tools UI ([5c2d7b2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5c2d7b2b53f0120dbed0509533a4fcf5d1115607)) by Elwyn Benson
* parse flow config schema version from config ([fea0eaf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fea0eaf6547c0848c321f4fce36179fb50450f21)) by Tristan Read
* Release useDuoChatUiForFlow feature flag ([7365601](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7365601dcb512268dd9fc5a0805a73bef61c35c5)) by Frédéric Caplette

### 🐛 Bug Fixes

* **cli:** don't incorrectly freeze tool approval messages ([63a63ca](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/63a63caac26a2709a9035867600361ac52b78e5e)) by Elwyn Benson
* prevent DAP reading binary files ([d7616ce](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d7616ce5d2c8ed56538b03e87b846bdb6ebb6f3b)) by Elwyn Benson

## [8.50.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.50.0...v8.50.1) (2025-12-08)

### 🐛 Bug Fixes

* Update tool approval status correctly ([b196954](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b19695474e8a50e5c3a20455b47411e011a258a8)) by Olena Horal-Koretska

### 🔁 Chore

* **deps:** update dependency @gitlab/duo-ui to ^15.0.5 ([1a24832](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1a24832499eb7e1f0743c63e24e6117ad79992a5)) by Olena Horal-Koretska

## [8.50.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.49.0...v8.50.0) (2025-12-05)

### ✨ Features

* **cli:** add prompt history scrolling ([870b84c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/870b84c28881656a0375d708f2df8ea259b61995)) by Elwyn Benson
* Update flow prompts and working text ([d091050](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d091050b8fa7047f919c68048e95a08564e9eb73)) by Frédéric Caplette

### 🐛 Bug Fixes

* **cli:** Correctly read gitlab base url from config or envs ([d76e0ea](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d76e0eaaeae94e5ba66ce2b41e1f9f17f7e4e43e)) by Dennis Meister
* **mcp:** Auto scrolling fixes and logs appearing in order ([4632307](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4632307e1bee56faf21dd23b85ae94444fd8f233)) by Dylan Bernardi

### 🔁 Chore

* set up webview storybook test ([36eab64](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/36eab64a770bca1e15a8a23d0b2be8d65a452681)) by Juhee Lee

## [8.49.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.48.0...v8.49.0) (2025-12-04)

### ✨ Features

* Capture streaming time metric ([5aad02c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5aad02c9c34429c69ef17ae672d7267e6adb38b0)) by Enrique Alcántara
* improve conversation start screen ([04876ca](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/04876ca9f70b2a9eab1380fb1e6beede116eba79)) by Andrei Zubov

### 🔁 Chore

* **cli:** send errors to Sentry ([7d9c887](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7d9c8877318e11dc6496e33a8e564474c9e9e528)) by Elwyn Benson
* **deps:** update dependency fs-extra to ^11.3.2 ([251f706](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/251f7060210d2c9a6ffffd6b3b80e5df757010d5)) by GitLab Renovate Bot

## [8.48.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.47.0...v8.48.0) (2025-12-03)

### ✨ Features

* **cli:** prune log files after 28 days ([f0b3f92](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f0b3f9271d89e6f06af6dddd13f091d8ab14c339)) by Elwyn Benson
* **cli:** restyle user/assistant messages ([d9861ee](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d9861ee1f9e631c080059ddaecb38142297ae235)) by Elwyn Benson
* **cli:** support `AGENT_PLATFORM_FEATURE_SETTING_NAME` option ([cfbbc77](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cfbbc779d24392d87372242a11690ad360b54030)) by Elwyn Benson

## [8.47.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.46.1...v8.47.0) (2025-12-03)

### ✨ Features

* Add plugin controller for the project selector ([82f926f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/82f926f977c434bf190e2acaf5d22987e657a351)) by Olena Horal-Koretska
* add prompt editor and uri based flow loader ([a07709b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a07709bb85a9fb4ca6a6e0025201256bc12413b5)) by John Slaughter
* Create `AgentPlatformProjectService` for DAP project selector ([9b6ba9c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9b6ba9cccd12ec37c80769aa0e6ef82e4005e417)) by Olena Horal-Koretska
* create navigation and update layout ([f68f8bd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f68f8bd1d67fd2c71054641d37593671e656961b)) by Juhee Lee
* Display friendly type errors in logs ([f7794e8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f7794e8adc535a5842a064bab3b22cbe1ab8136e)) by ŁUKASZ KORBASIEWICZ
* support `run_shell_command` action ([629b629](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/629b62987956a44b9975643b485c661e1201feaf)) by Elwyn Benson
* support AGENTS.md files ([1868191](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1868191943bee905e43e882ec00fb57a3ab5af03)) by Elwyn Benson
* use duo context exclusion on KG ([0895847](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/08958478c1a37fecef2ecb5b1db4b119a8cd0a5b)) by Allen Cook

### 🐛 Bug Fixes

* **cli:** re-enable support for ctrl+J line breaks ([807d6cf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/807d6cfd4acce8cb605d3fdff473aaf6dde45adf)) by Elwyn Benson
* **mcp:** Provide workspace path to MCP dashboard ([9dc987b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9dc987b25f4a3b31408f92d9f8582850e0a9820c)) by Dylan Bernardi

### 📝 Documentation

* update file dev_environment.md ([8fc3399](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8fc339961706210ad0ed4654e79d4077b4ae50c7)) by Roman Eisner

### ✅ Tests

* **cli:** add helper script for testing docker runs ([cfbd015](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cfbd0153b10cc84baef2a5f76450c1a50c702b58)) by Elwyn Benson

### 🔁 Chore

* **cli:** add JetBrains debug config ([3e7408f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3e7408fc3711de363f110171913663808349b94c)) by Elwyn Benson
* remove duplicated editorconfig rules ([324de92](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/324de927936a8c37a8d695b23e3f60cc856573ba)) by Tan Le

## [8.46.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.46.0...v8.46.1) (2025-11-28)

### 🐛 Bug Fixes

* check for TTY before calling setRawMode in CLI ([d1327af](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d1327af9ccc88c7875d6a8b9c432dec2f9651024)) by Mikołaj Wawrzyniak

## [8.46.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.45.0...v8.46.0) (2025-11-28)

### ✨ Features

* Add persistent storage for agent platform project ([54a3cea](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/54a3ceaf24464fb8021f9efd72c5a75ee77cd20d)) by Olena Horal-Koretska

### 🐛 Bug Fixes

* Improve message rendering performance ([7611001](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/761100147b3645b5fadfc334be38731df7d74a69)) by Olena Horal-Koretska
* protobuff fileds case conversion ([3599ccf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3599ccf3bcbe3f578530b6adeefa264045bfbde2)) by Mikołaj Wawrzyniak
* Return relative file path in the tool response ([a916cc3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a916cc3e0f9ee3f12848e1e3f2ce46c972bb2641)) by Olena Horal-Koretska

### 🔁 Chore

* add debug config for cli ([b4187b7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b4187b765bf63cb785d089309a2e8eee5efd16a6)) by Andrei Zubov
* dont depend on DWS client twice ([79117f5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/79117f51ebf0b6d2f9bcaf610b23e0ee589fa6da)) by Elwyn Benson

## [8.45.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.44.0...v8.45.0) (2025-11-27)

### ✨ Features

* **cli:** use kitty protocol in supported terminals ([ab9d16a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ab9d16a10061602e36c80e25d38da4366ed5a15c)) by Andrei Zubov
* Support resuming failed and stopped flows ([cc56c13](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cc56c13adf26d40cf85f0d73d79ce68e672d5650)) by Frédéric Caplette

### 🐛 Bug Fixes

* add back latestVersion to agents queries ([5dc5a0b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5dc5a0babbe3c171c4ab9669981215216af85c32)) by Lindsey Shelton
* Add inline tool approval flow for non-ChatFlow modes ([8c61ff5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8c61ff555cca229afca9812614cfab9920bc0869)) by Frédéric Caplette
* **cli:** Remove duplicated existing_session_id in subcommand ([3ce8bcc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3ce8bccc183c05a2cae4c981613356ccc3e625f3)) by Tian Gao
* **cli:** replace diff lib with new implementation ([6eab564](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6eab5643b5406a2c971423debba093c3b5620f91)) by Elwyn Benson
* Reintroduce root namespace for obtaining models ([eba14d1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/eba14d19bb6e562e1bb2b90138adcfc1841d6047)) by Enrique Alcantara
* Remove DuoChat Health Check ([7a92ed8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7a92ed88645124376f984e2028e111f282e5f81a)) by Dylan Bernardi
* resolve custom ssh aliases ([3dd0632](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3dd0632a060936441fa32b339d588587104fdc41)) by Karl Jamoralin

### ⚡ Refactor

* **cli:** use `UserService` in CLI ([30d4bdd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/30d4bdd7c88134f475eb386499f93750811d0e6b)) by Elwyn Benson

### ✅ Tests

* Define stories for core duo-ui-next components ([6367a33](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6367a3350e4e5940b15a3dc288bf58d73c174ae9)) by Enrique Alcantara

### 🔁 Chore

* Code review feedback ([20f56c8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/20f56c89e14c3e72cd1102837ee07212bfab8831)) by Enrique Alcántara

## [8.44.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.43.0...v8.44.0) (2025-11-25)

### ✨ Features

* **cli:** support nested `cwd`, refactor init code ([8b3896b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8b3896bc0a25c04db95f2cd14b24bcd5314c6ba4)) by Elwyn Benson
* **git:** support http proxy env variables for git commands ([8c58b02](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8c58b020bdbdc916bfcb77e4710bf08c20a7d490)) by Mikołaj Wawrzyniak

### 🐛 Bug Fixes

* Hotfix for loading available models ([d4a0b7a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d4a0b7a073c7a70a1a3e6ffb505476681db9f623)) by Enrique Alcantara

## [8.43.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.42.0...v8.43.0) (2025-11-24)

### ✨ Features

* add user-level chat rules ([b7cdcfb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b7cdcfb5d6a18fbc9a3ba98cb42518c03bf58c65)) by Allen Cook
* **chat:** Improve tool parameter visualisation ([e4f933b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e4f933b9dab0b83ebca2c2dae73911a1a573abea)) by Enrique Alcántara
* **cli:** support chat-rules.md custom instructions ([fc47884](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fc47884650742fe95cc7f64fa14420a49a750043)) by Elwyn Benson
* **dap:** create suggestion component ([bb00992](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bb009926ec4a4ac2d67094c3af8630f9682664de)) by Juhee Lee
* **flow:** add node configuration and refactor v1 persistence ([f78602c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f78602c97a84d365f3520892b4610d143a120b3b)) by John Slaughter
* **flow:** init visual workflow editor implementation ([dc2e5c3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/dc2e5c355c0d0a7e9d600b54084d9fcfea8d3709)) by John Slaughter
* Rename performance telemetry events ([cc4e0fc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cc4e0fcd18426178ba78edf98d818d9d36410f66)) by Enrique Alcantara
* Specify source in duo agent platform events ([ec00b65](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ec00b6527a9963fb924bfcefa04fd4aa9cd94d82)) by Enrique Alcantara
* Switch to `websocket` as default connection type in Node executor ([fad601c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fad601cf9146f98ad9ce0fd59d24aef2ba9f2282)) by Olena Horal-Koretska

### 🐛 Bug Fixes

* Add healthCheck to persistent storage instead of cache ([5cf0ea2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5cf0ea202368813fa7c5f2097cbdf369a157726f)) by Dylan Bernardi
* build failure from fdir update ([483740a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/483740ac9eaf47ab9d65cdfff9ffe73b2bb5b025)) by Juhee Lee
* **cli:** prevent 'freezing' messages incorrectly ([151b7af](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/151b7af16f3f959f0ef36262de1e75b619bb953c)) by Elwyn Benson
* custom agents to respect version pinning instead of using latest ([17cd9e9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/17cd9e90dc494152cf8e1898a1c06e0bd52f5f37)) by Jannik Lehmann
* Flows in new UI always start as chat ([f7faa94](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f7faa941f810676e9f85a83dbb4eee3cad582bdc)) by Frédéric Caplette
* set content of repository and directory contexts ([5c4eff1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5c4eff18478236dce4b5a99c075d5dc8263cbd8f)) by Pam Artiaga
* Update System context in UI once available ([84b5c28](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/84b5c2846cd055fa04f11ae4be0df1689ae283c3)) by Olena Horal-Koretska
* Uses root group instead of namespace ([2785c18](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2785c1861d576241c008a3086074a33481a59c9c)) by Donald Cook

### 📝 Documentation

* Add instructions for running the LSP server by using 'npx' ([db8d068](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/db8d0683edabef0e39fcb04e2b7f6bb3ac3e769c)) by Evan Read

### ⚡ Refactor

* extract user rules to workspace package ([eff9709](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/eff97097a8b56ad9d219539f87a36d88e7977ed6)) by Elwyn Benson

### 🔁 Chore

* add webviewId for DAP Duo UI Next and update pkg name ([86336b2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/86336b2003bbba9aecf96e080c7634fe59bfa1e9)) by Juhee Lee
* remove use of use_duo_context_exclusion FF ([d9625f5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d9625f540f27b5ef0b3effe5fd8902bceaa8c0f8)) by Allen Cook
* roll documentation linting tool versions forward ([edcc5ed](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/edcc5ed04d49bcbc054ac2511e4389a03a3c86a6)) by Evan Read
* setup storybook in unified webview ([2d82503](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2d8250360ca7ce144f9450539d66401e626fabc6)) by Juhee Lee
* update duo-cli readme ([5d1c601](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5d1c601931ed77eb9c7e8c0be8c77cf3212de65d)) by Andrei Zubov
* Use camelCase in shell context provider ([2eeb7df](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2eeb7df7caa1205eb0c28d5c480a50577d2d591e)) by Olena Horal-Koretska

## [8.42.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.41.0...v8.42.0) (2025-11-18)

### ✨ Features

* Add flow plan iterations in new UI ([157121c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/157121c20bfa559a6f438d735f540178bcff9b36)) by Frédéric Caplette
* **mcp:** surface cause in MCP tool execution failures ([6ae6619](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6ae6619d93de69b4dcb918c148b54069ce03e95f)) by Tian Gao
* use the withDuoEligible in /include project in duo agentic chat ([02c0a19](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/02c0a19ba836c456cb4b1981751c2cc769efb30f)) by Tian Gao

### 🐛 Bug Fixes

* **cli:** Avoid showing error when user aborts workflow ([e6429bf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e6429bf2ccd604866e454b148569ec82c52782b4)) by Anna Springfield
* **code-suggestions:** ignore abort errors in circuit breaker ([2f87780](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2f8778077db593caa2761a7ee92e984184cfe147)) by John Slaughter
* **mcp:** Respect certificate and proxy options for remote MCP servers ([2edeac7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2edeac7daa68303a01536abb1b35a2092d347ea5)) by Erran Carey
* Update editor selection context provider ([a09907b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a09907b4186e199df4f9af31d620ad6a4d36a315)) by Olena Horal-Koretska

### 📝 Documentation

* Add information about setting additional code completion languages ([881b686](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/881b6863e1f704c4fe45230933de8d4923431494)) by Evan Read
* document nodejs versions across LS ([de5e1cf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/de5e1cf3c846ada0d65ab71c30bc64069c11ec75)) by Tristan Read

### 🔁 Chore

* remove unused pkg config ([a833212](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a833212a33642470d7a536ec643809b282e8585d)) by Tristan Read
* replace emoji shortcut with emoji characters ([e694c8f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e694c8f5a5a5cab705abdb987141f377aa475d7f)) by Juhee Lee

## [8.41.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.40.1...v8.41.0) (2025-11-14)

### :sparkles: Features

* add Windows ARM64 binary support ([acc7864](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/acc7864c1787680c83514a4281f25af6a65f72bd)) by Karl Jamoralin

### :bug: Bug Fixes

* add git user.name config for proper attribution ([47a651b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/47a651b991b88833e3712834e566ffe8a5ded1e5)) by root

## [8.40.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.40.0...v8.40.1) (2025-11-14)

### :bug: Bug Fixes

* **mcp:** Disable custom fetch for SSE and streamable HTTP clients ([1eb1134](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1eb1134abeb3eee4cf1599bac2941e456a09ac6b)) by Erran Carey

## [8.40.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.39.0...v8.40.0) (2025-11-14)

### :sparkles: Features

* **cli:** support --existing-session-id for TUI ([c74a055](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c74a05592aec5f5498ff8dd244f0c5600423853b)) by Elwyn Benson

### :bug: Bug Fixes

* fix npm install by moving patch-package to dependencies ([4062dfe](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4062dfe12086f2962c89e05216cdfa2f182c6593)) by Andrei Zubov

## [8.39.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.38.0...v8.39.0) (2025-11-14)

### :sparkles: Features

* **chat:** Support foundational agents in extensions ([a3398df](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a3398df120cc46fd1153a5bb92a0953244bbb8e5)) by Eduardo Bonet
* **dap:** initialize new DAP webview landing page ([1aa8984](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1aa8984fb185c283bec43299a9582a933aee52e4)) by Juhee Lee
* **mcp:** Respect proxy and certificate options in remote MCP clients ([0d7230f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0d7230fec2b86536cab376d419a1c22f6707e438)) by Erran Carey

### :bug: Bug Fixes

* **cli:** stop default 'insecure' value triggering validation ([d304154](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d304154581ca1187a8844520808991bd580b7a20)) by Elwyn Benson
* Small papercuts in agentic chat panel ([bbd2d89](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bbd2d89005f93b76f72ee7f5f5f381c7c41da7ed)) by Enrique Alcántara
* Track AI context file content with FileStateTracker ([a58f66c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a58f66ce04abcb09f0da2faec06ce4cbcbc54138)) by Olena Horal-Koretska

### :zap: Refactor

* **cli:** spring cleaning, organise files ([b3651f7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b3651f79a82d915c79b2fd2a96fccaafca086fc1)) by Elwyn Benson
* rename `HeartbeatManager` to `DailyActivityTracker` ([7145b1b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7145b1b6816c076c7ca845a6dd38db553466c03b)) by Olena Horal-Koretska

### :repeat: Chore

* Add feature flag for flow ui ([ec242b0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ec242b036348a5a8644066ea3d579f2a823a3153)) by Frédéric Caplette
* Add WebSocket client heartbeat ([76cc6c2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/76cc6c24a17e44f3e6bf485493ac6d14a8a42e66)) by Olena Horal-Koretska
* close gRPC connection when disposing grpc_client ([4d4b6c4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4d4b6c4b5151712a5c959e8ebc14ca222447670d)) by Dylan Griffith

## [8.38.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.37.0...v8.38.0) (2025-11-13)

### :sparkles: Features

* Add current file relative path as agentic chat context ([c024e6e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c024e6e8be7b9a5ef4c82e189a868bf7635d13a7)) by Anna Springfield
* **cli:** add missing os_information context ([7e3afd1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7e3afd169887df25ba1792e93ee141df4f0d556e)) by Mikołaj Wawrzyniak
* improve text editing and navigation in Duo CLI ([8d80226](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8d802262f0bb218217397ff43a5e6799546b6eb8)) by Andrei Zubov
* Support plan approval in Chat ([4ab3d3e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4ab3d3e5eb9e07939ae4d3ace919b08cd5408178)) by Frédéric Caplette

### :bug: Bug Fixes

* **cli:** write to log file async, don't block main thread ([88e58b6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/88e58b66c706d4efb0029dc634675f826e2a7338)) by Elwyn Benson
* exclude some sensitive env vars from `run_command` process ([464da1a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/464da1a270de641a3adfd95229be9917f4e7d31d)) by Elwyn Benson
* **mcp:** handle triple underscores in tool names for McpToolName validation ([1f915f7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1f915f7911c2f181fb23244640a423057d3ff183)) by John Slaughter
* Separate error and logs for run_command tool ([6cd987f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6cd987fad54283044ee219199e0e3570204aaa3c)) by Olena Horal
* **windows:** Spawn STDIO MCP servers in the background ([5ff053f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5ff053f27762199190d0c7c8a6ddd1376073bcab)) by Erran Carey

### :white_check_mark: Tests

* Fix web browser integration tests ([b5f8f9e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b5f8f9eeeefc5888d01e3bfdc17f2045645c7587)) by Enrique Alcántara

### :repeat: Chore

* add extra debug logging when no workflow ID is returned ([dd9ff33](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/dd9ff3356c7bbe95d8db56abd3bc1322972b3e0b)) by Elwyn Benson
* **cli:** force default connection type to grpc for now ([2b1d43b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2b1d43b4aebe9adb79ebd5f4d4b8d2d441bd98b4)) by Elwyn Benson
* **cli:** remove no-api CI mode ([ce3c1b0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ce3c1b01b0e4621095bb531dc844c2cb16c2a2d7)) by Elwyn Benson
* Expand linted files and autofix ([3c82e2d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3c82e2d4aa96d453c00636ebcc7d1b88b4699e15)) by Anna Springfield
* Fix pre-commit prettier hook to match CI checks ([8dfcbcc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8dfcbcca385c4ca771e8b7172b8825ee89ee09e2)) by Anna Springfield
* switch duo-cli to trusted publishing ([6e3517c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6e3517cc6c61807d04d19e96c74f5ea3ad37a174)) by Andrei Zubov

## [8.37.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.36.1...v8.37.0) (2025-11-11)

### :sparkles: Features

* Allow flow iteration in Duo Chat when FINISHED ([d1810c3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d1810c3ec0b9f86e9464829aba4ce3af808808ee)) by Frédéric Caplette
* **cli:** commit older messages to shell history to prevent constant scrolling ([91dfdfd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/91dfdfd8dff1a69317075bf7d7f029e51bb3d98e)) by Tomas Vik (OOO back on 2026-01-05)
* **cli:** use stored config for headless runs ([dd98187](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/dd98187665a70b9b496dc67880463927e0ed467c)) by Elwyn Benson

### :bug: Bug Fixes

* Record that file was read with `read_files` action ([463aa5f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/463aa5fae9d5354e33f8eb823b363d093132bbe0)) by Olena Horal-Koretska
* Send the right payload for flows plan edit ([756a83f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/756a83f95a108be9d2edf767af0b783e3a5af20e)) by Frédéric Caplette

### :repeat: Chore

* **cli:** add CLI version and OS info to debug logs ([cfc76c1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cfc76c1cbd22756375c67db03a8a84e234f172f4)) by Elwyn Benson
* simplify semantic release script ([a189c95](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a189c9550bc5cbde3bf949215b2f682d12b20760)) by Stan Hu

## [8.36.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.36.0...v8.36.1) (2025-11-10)

### :bug: Bug Fixes

* change to insecure flag to take value, to make it work with arg parser ([df261fc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/df261fcf2f462b89e6aed8cb1f0a29b37c8b0f44)) by Mikolaj Wawrzyniak

## [8.36.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.35.0...v8.36.0) (2025-11-10)

### :sparkles: Features

* **cli:** anthropic backend improvements ([5200a3a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5200a3aaab9b5917e473368c75d9ce898d3f88b6)) by Elwyn Benson

### :bug: Bug Fixes

* allow gRPC connection in CI mode to fetch feaure flags ([b80325f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b80325ffece332cae434a529b9cabb1a24ca0f3d)) by Mikolaj Wawrzyniak
* Always load the right mode sessions ([2b5c64f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2b5c64fffe618b99b187f52946fd629be2785109)) by Frédéric Caplette

### :zap: Refactor

* **cli:** extract event mapping code ([83f067d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/83f067d2b6f641cccfd67332237968e7fc8992a9)) by Elwyn Benson

### :fast_forward: Performance

* **cli:** initialise MCP servers preemptively, faster first Duo response ([4e22085](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4e22085ead4ae8ee2b9b0b346887f507155b6aa4)) by Elwyn Benson

### :white_check_mark: Tests

* **cli:** add tests for workflow event mapper ([5fe34cb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5fe34cbb11982e6d47db92d991d93c071d8a065a)) by Elwyn Benson

## [8.35.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.34.0...v8.35.0) (2025-11-07)

### :sparkles: Features

* Add install base telemetry tracking ([1830a4b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1830a4b0d40ab0dfac9434dc16cc2bf02d3115f7)) by Karl Jamoralin
* Capture performance metrics for agentic chat ([6547ae4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6547ae4f439773778c9a1121439c4a28515712e5)) by Enrique Alcántara
* **cli:** generate diff from full file content ([088c714](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/088c714f56be109ffa25a808b646b13324b69df4)) by Elwyn Benson
* **cli:** try set terminal window title ([e1324ff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e1324ff81bc14f5d85060415568cea909eb3eaae)) by Elwyn Benson
* Update Duo UI to 13.7.0 ([7607b3c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7607b3c2fd61efb16fa398886d64262c2c2f4551)) by Enrique Alcántara

### :repeat: Chore

* Add flow mode to Duo Agentic Chat ([c13f6a9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c13f6a9d79eea605abda9a68d0836637ff2a586b)) by Frédéric Caplette

## [8.34.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.33.1...v8.34.0) (2025-11-06)

### :sparkles: Features

* add file search context action to dui CLI text input ([cd41f1a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cd41f1a272ff0acf59a0f8118aff978fefaa7057)) by Andrei Zubov
* **chat:** adds visual tip for foundational agents ([a71f5f2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a71f5f2d447733dd7b0f20a052b4ce79c5a5626e)) by Eduardo Bonet
* **cli:** allow switching between grpc/websockets ([5882cea](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5882ceaca279cf532817b9348b196b463fda82ef)) by Elwyn Benson

### :bug: Bug Fixes

* **flows:** Tool approval controls are hidden ([77bc107](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/77bc10779c174b4889bc82c554e7fe8cd15f6b9f)) by Olena Horal-Koretska
* improve string to boolean env var parsing for duo CLI ([f562290](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f562290150b739ff2ba464e72fba950a4c5ec229)) by Andrei Zubov

### :repeat: Chore

* **cli:** don't fetch feature flags when using websockets ([5930e30](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5930e30631e963bcfe120e88fef19ba6885be24d)) by Elwyn Benson

## [8.33.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.33.0...v8.33.1) (2025-11-06)

### :bug: Bug Fixes

* Syntax highlighting and background color of code blocks ([9f77190](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9f77190ae3d7c31240b10ba59260f1af2bf9a964)) by Enrique Alcantara

### :repeat: Chore

* update duo-ui package and apply styling changes ([9d58af2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9d58af256fd0ef0ed688db87e5f0e3c8ead2bbff)) by Juhee Lee

## [8.33.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.32.0...v8.33.0) (2025-11-06)

### :sparkles: Features

* update node.js version in compiled binaries to 22.20.0 ([1ec9fe1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1ec9fe1d5044764874cf4381a64d5c51ec88a27d)) by Andrei Zubov

### :bug: Bug Fixes

* Close `websocket` with `1000` (ok) status on LSP `shutdown` ([05e6fa1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/05e6fa189039d0662053f06174e7acb45e990259)) by Olena Horal-Koretska
* **mcp:** Enable theming on new UI webviews (including MCP dashboard) ([149f7e1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/149f7e19f6308b575c5536598f4eb68e5344e9e1)) by Dylan Bernardi

## [8.32.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.31.0...v8.32.0) (2025-11-05)

### :sparkles: Features

* **cli:** added version argument ([f9b863a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f9b863a69ebea1c0ec082b2affcb9e0e63f3b66d)) by Donald Cook
* **cli:** initialise API service on start ([e2dbaa7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e2dbaa7221273203864d6473d78484c8fd56c3e2)) by Elwyn Benson
* **flow:** init flow webview ([d1ed0ef](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d1ed0efb3b9a921e1e816bc2186266bc6deb0f63)) by John Slaughter
* **mcp:** Expose MCP dashboard webview ([34dda3b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/34dda3b6dbcc5d476b6aaa9333ccd8ede51300ca)) by Dylan Bernardi

### :bug: Bug Fixes

* **diag:** Add health check cache and increase intervals ([f82a0c8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f82a0c881e892368716d6490629d16847ba27323)) by Dylan Bernardi

### :repeat: Chore

* **deps:** update dependency fastify to ^5.6.1 ([4ab5625](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4ab5625cbda1f0be8341f3eccacdc62bd095ed66)) by GitLab Renovate Bot

## [8.31.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.30.0...v8.31.0) (2025-11-05)

### :sparkles: Features

* Add feature flag to merge flows and chat tabs ([9cac2a7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9cac2a7bc485a4212054abb272666e0b2e9c4fa4)) by Frédéric Caplette
* add issue templates for Duo CLI to improve triaging ([b9ba91a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b9ba91a20495539dfab48cf029a633ec9cd98a2d)) by Meg Corren
* **cli:** support `CI_REPOSITORY_URL` env var in CI ([cab843e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cab843e422c114649697d2b61cf05d69c4f2602b)) by Elwyn Benson
* **mcp:** Add frontend for MCP dashboard ([fceb953](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fceb953c36a2d43fac886a5331105ed5b1a93638)) by Dylan Bernardi
* Remove error from truncated plain text response ([1e6a752](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1e6a7528525a73d4ca169911e9af7ea8e87bd678)) by Olena Horal-Koretska

### :bug: Bug Fixes

* **cli:** display tool failures correctly ([a73bd4b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a73bd4b01e74fc778930a897aebddf074eb0f7a7)) by Elwyn Benson

### :repeat: Chore

* **deps:** update dependency fastify-socket to ^5.1.4 ([e19bda9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e19bda98e45e941998448d2e075207fd84022d26)) by GitLab Renovate Bot
* fix headles executor ([0465a0b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0465a0b6c2ca804e61a2a4957fcc4a92a20cf1b2)) by Mikołaj Wawrzyniak

## [8.30.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.29.1...v8.30.0) (2025-11-03)

### :sparkles: Features

* **cli:** use external token+metadata if provided ([c734d44](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c734d44ce7b38510ce5148cc9a3f00467dda4eb7)) by Elwyn Benson

### :bug: Bug Fixes

* **ci:** pass along `out/` directory in `build-integration-binaries` setp ([9365cfb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9365cfbc2b0bc6d38385b0e8b412b9bf8fbb1e63)) by Stan Hu
* **cli:** Fix unapproved command execution for duo-cli ([8791266](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8791266c2c4e98fa96feaf16e5331db8e1ba198a)) by Andrei Zubov
* **mcp:** Ensure session approval only shows for MCP tool calls ([220c590](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/220c590070c9b27b34913edddf4cbf43eab92634)) by Dylan Bernardi

### :memo: Documentation

* **cli:** improve install/update docs ([3c4582f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3c4582f43c5b1c7635c139e551d3446f6418b330)) by Elwyn Benson

## [8.29.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.29.0...v8.29.1) (2025-10-31)

### :bug: Bug Fixes

* do not recompile binaries in CI ([ebcfe9c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ebcfe9ccd50e53585b0f53e26841a3cd47e44ed5)) by Stan Hu

## [8.29.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.28.1...v8.29.0) (2025-10-30)

### :sparkles: Features

* Cleanup workflows on LSP "shutdown" ([af4189d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/af4189dba0436f86c56837ff7c95d33db67bae87)) by Olena Horal-Koretska

### :bug: Bug Fixes

* ensure publish step only pulls signed binaries ([47a499f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/47a499f96c670b2f49a03e29ffe8b31102a3f0b9)) by Stan Hu
* **mcp:** connection race conditions and lifecycle management ([ac52071](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ac520714bb583bc8578498779a38a8ed4834cdf2)) by John Slaughter

### :repeat: Chore

* **deps:** update dependency @gitlab/needle to v1.5.1 ([69ae54a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/69ae54a9a7c2d6d7b846f21c5eccf31f5d8ed571)) by GitLab Renovate Bot
* **deps:** update dependency @vue/server-renderer to ^3.5.22 ([08e94f5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/08e94f58c3d40486bd77f5078aa7c6938e816a88)) by GitLab Renovate Bot

## [8.28.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.28.0...v8.28.1) (2025-10-30)

### :bug: Bug Fixes

* Stop throwing on empty repository URL ([b1f09b8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b1f09b8a6ae94acbd5d94e670aae29268683b1f6)) by Erran Carey

## [8.28.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.27.0...v8.28.0) (2025-10-30)

### :sparkles: Features

* Disable chat cancel before created and in tool approval stage ([8309f62](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8309f624499ababfa9d9ebd063dd72ceb0f2885c)) by Olena Horal-Koretska
* Disallow stop before workflow is created or in tool/plan approval stage ([4d86fcb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4d86fcbf456145178739842b96bb175068fd7ea3)) by Olena Horal-Koretska
* **mcp:** add client infrastructure for dashboard ([29437be](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/29437be486c7f082a37507b319458251279097ff)) by John Slaughter
* sign macOS binaries with Google Cloud HSM ([5334a67](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5334a678dcbe269fa1a6d541f2841b4e1abbce09)) by Stan Hu
* support git worktrees for code suggestions ([358fdb8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/358fdb85b2af09cfee1e946436ab7d5c7bbbcc5f)) by Mohammed Osumah

### :bug: Bug Fixes

* **cli:** fix cursor behavior for multiline text input ([e4bab51](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e4bab51f6a0afa2074598cec8d03be6e63158398)) by Andrei Zubov

### :repeat: Chore

* **deps:** update dependency @gitlab/duo-ui to ^13.3.0 ([ff73250](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ff73250cafa5113e32747663a27950a7bbe7a481)) by Olena Horal-Koretska
* enforce pascal case for enums ([cf2f602](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cf2f60265844623090b609ac1959c3a6fa42ab2e)) by Tomas Vik (OOO back on 2026-01-05)
* forward all DAP headers to AI gateway ([1909e25](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1909e2567601f57d5cefb6b411133c9241060a7c)) by Elwyn Benson

## [8.27.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.26.0...v8.27.0) (2025-10-28)

### :sparkles: Features

* add configuration UI screen ([944490e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/944490ecca609a5b94ba10ccf4280ddd3ed375a8)) by Andrei Zubov
* Add model selection for GitLab Duo Agentic Chat ([e3674a2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e3674a2064b46b8a987ecd731a9ada3958b2b730)) by Erran Carey
* **cli:** advertise LOG_LEVEL in CLI help text ([6abaaff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6abaaff31e85dd0d79c0bcfc4b3e88b2179e41e8)) by Elwyn Benson
* **cli:** defer init, instant render of UI ([b187018](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b187018b118f6925787eb656f32a480d4c6fded5)) by Elwyn Benson
* **cli:** MCP tool approvals in anthropic backend ([99de04d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/99de04d5480dea2eede65ee47797028e87013d45)) by Elwyn Benson
* sign Windows binaries ([d8d1f64](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d8d1f64c3981210dc395c0485f4e1b9452196ede)) by Stan Hu
* Stop chat workflow gracefully ([300f847](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/300f847ce8b48f83bcb787435bc74ff1df04bab3)) by Olena Horal-Koretska
* Stop software_development workflow gracefully ([453128b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/453128be4b4bbb5a8ed7b523bef6bc4d6214f6da)) by Olena Horal-Koretska

### :bug: Bug Fixes

* git project resolution fails with some SSH remotes ([824b9ee](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/824b9ee9b43fc88706eea1f9a2492aa13cc46d50)) by Elwyn Benson

### :zap: Refactor

* Always fetch graphql response for 18.5.0 and later ([9e49239](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9e49239dcb320652dc4ec4f27d34c54bd55305a9)) by Erran Carey

### :repeat: Chore

* **deps:** update dependency @gitlab-org/duo-workflow-service to 1.34.0 ([e09936c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e09936c640bc228d166ccc9e979d028afed3f3d9)) by Olena Horal-Koretska

## [8.26.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.25.0...v8.26.0) (2025-10-24)

### :sparkles: Features

* **cli:** disable tool approvals for headless runs ([58125cf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/58125cff718d4404581b949333a9a70f63fa8b2f)) by Elwyn Benson

## [8.25.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.24.0...v8.25.0) (2025-10-23)

### :sparkles: Features

* Add events validation CI job ([1b635c0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1b635c08df8f359ed2a57d225fbf447f86b0e729)) by Nwanna Isong
* **cli:** add initial system context for CLI ([7304d2f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7304d2fad41053140dd8ca11e527504a9baf039c)) by Elwyn Benson
* **cli:** integrate MCP manager in Tools wrapper ([ba827c5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ba827c53c1271ec7fe623b92b4004653c95bd96e)) by Elwyn Benson
* **cli:** port MCP tool to CLI ([d6244c9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d6244c93ca3dae4806ee550a38816befe1ffd707)) by Tomas Vik (OOO back on 2026-01-05)
* **cli:** truncate large stdout messages ([0c1122d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0c1122d4bf28ec3339d99d319e0e991359659142)) by Elwyn Benson
* send user-agent to dws ([d63c99a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d63c99a2c9f6faf74e6aa8b567aa86f64c858067)) by Shinya Maeda

### :bug: Bug Fixes

* **cli:** handle null tool_info property ([5d76b13](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5d76b139318d72b00ae83904144621d57229f308)) by Elwyn Benson
* **mcp:** Only show approval options for MCP tool calls ([5b9f5e2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5b9f5e26be58d68ac2563dac79a08cbd87c09b1e)) by Dylan Bernardi

### :zap: Refactor

* extract user service to workspace package ([41b415f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/41b415ff893d1323c135a9e5fd15a4cb900f5186)) by Elwyn Benson

### :repeat: Chore

* Add header to node grpc and node websocket ([281ab8c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/281ab8cdc379851c07ba2214d1c4758de469df26)) by Joey Khabie
* **cli:** allow arbitrary workflow types ([9ede4a2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9ede4a245da98e59bd65001b2d48a1cd2dfbc326)) by Elwyn Benson
* **deps:** update dependency @git-diff-view/core to ^0.0.35 ([3b5e40b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3b5e40ba849490457a76029fd930f5e8fa5ce83f)) by GitLab Renovate Bot
* **deps:** update dependency @git-diff-view/file to ^0.0.35 ([b937e1e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b937e1e20ef7ced44759e1b261257d23b06beb68)) by GitLab Renovate Bot
* **deps:** update dependency react to ^19.2.0 ([10ac023](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/10ac0239f7733c79a13406ce433632d9bc63b60c)) by GitLab Renovate Bot
* remove api-extractor ([f8616eb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f8616eb406660bc995039858fbe072ad0a6a383a)) by Elwyn Benson
* Remove changelog `none` option in MR template ([d797f32](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d797f32367f0b6541af71a67f21085a15b3771f8)) by Juhee Lee
* Use the new Duo Chat icon ([b023f7e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b023f7e67708390e2e00aa084706c616b914b87c)) by Erran Carey

## [8.24.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.23.0...v8.24.0) (2025-10-20)

### :sparkles: Features

* **cli:** implement request cancellation ([cbaa14d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cbaa14d83da5cec9b0f0f04e262ebfd976327ae4)) by Tomas Vik (1 day until parental leave)
* **cli:** port workflow telemetry to CLI ([c8440eb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c8440eb2017b36b77f36450669e6972ca8a0644a)) by Tomas Vik
* **cli:** support git authentication flags ([3dd0267](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3dd026738db3f8e2d6ac96f1c5a12b5a45c203a5)) by Elwyn Benson
* Do not use `chatRequiredFeature` to guard OS/Shell context inclusion ([6d44fd3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6d44fd351e19d5873b61732bf003a90b9f69fa69)) by Olena Horal-Koretska
* Persist selected project for repository ([fe0b762](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fe0b76296df6775cf9516ca1b6f938b3bab87448)) by Olena Horal-Koretska
* use local workspace repositories as repositories context options ([5866581](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5866581e716838cc35af338e1932c3796b832fd0)) by Anna Springfield

### :bug: Bug Fixes

* **cli:** tool_response can be a simple string in a case of tool failure ([4996501](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/49965018bb50b0dd25f37bb3c7304012e26ac1e8)) by Tomas Vik

### :zap: Refactor

* clean up the backend types ([4cd8d83](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4cd8d839b2d3977ed7a2d94f6d95127dc1c0aba8)) by Tomas Vik (2 days until parental leave)

### :repeat: Chore

* **cli:** fix CLI release ([f3a73b5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f3a73b516c6ce328afe032518ba11e88c346865e)) by Tomas Vik

## [8.23.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.22.0...v8.23.0) (2025-10-17)

### :sparkles: Features

* add "log clear" command to duo CLI ([d6db4ae](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d6db4ae40a63e2f2aeb26a3c0d4266354a9a27e2)) by Andrei Zubov
* **cli:** add support for existing workflow ID parameter ([7d9cd60](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7d9cd60e580ee840b48b52602f45ac3146751c38)) by Elwyn Benson
* **cli:** add system prompt to the antrhopic backend ([21b4bc2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/21b4bc269d5147856e2fe31ca7dcb26ea59bbc7e)) by Tomas Vik
* **cli:** allow passing AI Context Items to workflow runs ([90a440f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/90a440f1f2dc0045925b01eb506f70c4a564066d)) by Elwyn Benson
* **cli:** backend config pattern, support `flowConfigSchemaVersion` ([4462a0c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4462a0c88806d471454bf57b234daf9462471729)) by Elwyn Benson
* **cli:** collapse tool details, ctrl+o to expand ([1983a0c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1983a0c981a28150bdf9b5f3aeba5a86944dc438)) by Tomas Vik
* **cli:** ctrl-c to clear text input ([9a1c3ca](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9a1c3ca0733f7fd2817087bf751092d809cd10db)) by Tomas Vik
* **cli:** show diff for edit file tool ([0864395](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0864395f7a5d4d22231464c864fbfadfe2225601)) by Tomas Vik (2 days until parental leave)
* **cli:** support flowConfig object ([da9bd16](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/da9bd160c30e0845aec9658d1273b2db0ed1060f)) by Elwyn Benson
* **cli:** support relative paths for --cwd ([23aa6b4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/23aa6b4f1abebc6cbf793bd5c0eeb07fbb04a866)) by Elwyn Benson
* **cli:** support workflow type flag ([d96584d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d96584d8c85fcdc6a68b801b426fd0ef1169cd2e)) by Elwyn Benson
* **cli:** tools format their input ([06229b4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/06229b4105064bacae759feab9700cc9b29bd124)) by Tomas Vik (4 days until parental leave)

### :bug: Bug Fixes

* ensure run_command falls back when integrated shell is unavailable ([e59963d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e59963d8118d3401ef93f748770d057c8706150b)) by Elwyn Benson

### :memo: Documentation

* **cli:** add details to CLI readme ([ed028e6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ed028e64e07d3803c9bc76a5dd3505f1d550f7ef)) by Elwyn Benson

### :zap: Refactor

* **cli:** prepare for showing tool input ([f34a31d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f34a31d563304a364bf35ee6f1414bfb45a3e6c0)) by Tomas Vik (4 days until parental leave)
* extract duo feature access types to package ([50da133](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/50da1339b2ef7a1eb3089059407233378646b332)) by Elwyn Benson
* max repository discovery depth ([ce42a9f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ce42a9f26caae81bb5b501d334ab2ddc9d776182)) by Tomas Vik
* smart textInputControl component ([52b102f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/52b102f0602d779d56ba6d3998946fb0a7731fa8)) by Andrei Zubov

### :white_check_mark: Tests

* extract simple-git setup method ([54b0fae](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/54b0faee33790efbfdee957f56650b6e89747ded)) by Tomas Vik

### :repeat: Chore

* **cli:** add the GitLabApiRequest tool ([390c983](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/390c983573ed5eb9d7f0ab5344306abe41e58105)) by Tomas Vik
* **cli:** increase turn limit to 30 ([5b375dc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5b375dc538fc05263c651fe3eebf46d1c8b51233)) by Tomas Vik
* make it easier to pass cli arguments ([2e71352](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2e713523fb269fed5ab35bb6ef3b86ac0630f289)) by Tomas Vik
* update docs linting tool versions and update linting rules ([4a39f2d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4a39f2db1c9162e2637d2a755bb02cc818cf4d3f)) by Evan Read

## [8.22.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.21.0...v8.22.0) (2025-10-14)

### :sparkles: Features

* Add telemetry to track stop button clicks in DAP ([bafeaea](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bafeaeadcf25e72a0bb3da3418ad873369bcbe2d)) by Olena Horal-Koretska
* **cli:** add command output to gitlab backend ([062dad0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/062dad0a91db1dbae15bde78b07e71556fe48014)) by Tomas Vik
* **cli:** allow setting goal from env var ([4bb00ec](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4bb00ecfe34d4426894b5893b1ff3b763cad077d)) by Elwyn Benson
* **cli:** anthropic backend supports tool approval ([add829d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/add829d976a1548df70ee30e68080fd62c8734b3)) by Tomas Vik
* **cli:** introduce Error TUI ([88e1a66](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/88e1a668f2da66d3b450b8c7a2eee47a1de08b19)) by Tomas Vik
* **cli:** paste large content + bracketed paste mode ([46f6fba](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/46f6fbacbc1c75e11ab6d1d380fd9e80cf96bd47)) by Tomas Vik
* **cli:** simple project resolution ([1e258c3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1e258c31de7e16dfd0e924f672421c0b15db9fc3)) by Elwyn Benson
* Update Duo UI to v12.2.0 ([6c41e0c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6c41e0c5b16ff9457742c0ed689b345b254e0e68)) by Enrique Alcántara

### :bug: Bug Fixes

* **cli:** resolve DI ambiguous reference error ([5c9de70](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5c9de7078198cc4887f8756017604f5f9ac87e69)) by Elwyn Benson
* Fix tertiary button on light themes ([8e9d9ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8e9d9ad94676aa34066dc26edd0e714cd18446d4)) by Enrique Alcantara

### :zap: Refactor

* move Workflow UI Chat Log types to the API ([f80b485](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f80b485fdba96ae4c29ef4879867a5baa95f4071)) by Tomas Vik

### :repeat: Chore

* **deps:** update dependency @asteasolutions/zod-to-openapi to ^7.3.4 ([c872f79](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c872f7955dc5c293c0850a2828e51b0e3a9cdc6f)) by GitLab Renovate Bot
* fix duo cli dev mode ([05041c1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/05041c182b4c0c3e386a2f87510fed01f9920cdb)) by Andrei Zubov
* Split persitent storage into Generic and User-Specific ([86939f4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/86939f4961711ac8a0f79062a6817173d3eb1d06)) by Olena Horal-Koretska

## [8.21.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.20.0...v8.21.0) (2025-10-10)

### :sparkles: Features

* add basic command approval UI ([a9b0020](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a9b0020910e57022c04049a216e6fcbf272bd44e)) by Andrei Zubov
* add sentry error tracking to node executor ([d373187](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d37318755066add507e3740e807cbe5e76d15540)) by Tristan Read
* Add system context to `software_development` flow ([6294561](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/629456127fb4914f20e7018ffd7fc0ee0b88548f)) by Olena Horal-Koretska
* **cli:** multi-line text input with cursor and clipboard support ([a10bd81](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a10bd819d8ba0e890af73aa20d0c2a55b6b87134)) by Tomas Vik
* Improve `runGitCommand` action handler ([a349581](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a349581c4d3ab9acea7c31f1d51e9ba65dbed103)) by Olena Horal-Koretska
* support git worktrees for tools ([1ff3ad1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1ff3ad1041d8f388069fc4248a07a7c23b32dadc)) by Tomas Vik

### :bug: Bug Fixes

* Do not drop connection on graphql error ([daea550](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/daea55028b7780cda2feb996e52f47b2dcf8ff14)) by Olena Horal-Koretska
* Do not fetch new chat workflow ([9f68c38](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9f68c381e5d122cac0790e592dfe9fd2d24b2582)) by Olena Horal-Koretska
* Do not fetch newly created workflow ([c2607f1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c2607f18dbc3ce36b443872afccbb08bfd745c7c)) by Olena Horal-Koretska
* treat websocket 1006 code as abnormal closure ([c8e90f8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c8e90f86df0ce2504cfaf326310259c58a6fb8c1)) by Elwyn Benson

### :zap: Refactor

* node executor uses async generator ([00d8111](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/00d811191b5337d0f61a80dad2047b67d8017c41)) by Elwyn Benson

### :repeat: CI

* remove windows jobs ([b225683](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b225683cf50afa7a1684b64eb226563e25b3d91a)) by Tomas Vik

### :repeat: Chore

* Drop metadata from query ([dc79a88](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/dc79a88d3fb7cbbc736d59ef3787938af1a158ce)) by Olena Horal-Koretska
* Remove polling and refetch on timer ([ef2becc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ef2becc6cc0ce5150d436a94b8b261080cdff81c)) by Olena Horal-Koretska
* Support user model selection workspace setting ([cf83d8d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cf83d8d2aacdf14377c60064f6259dfb87b6d7c5)) by Erran Carey

## [8.20.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.19.1...v8.20.0) (2025-10-08)

### :sparkles: Features

* Add persistent storage implementation ([8281cff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8281cff1b4e29c122c2eecd9ea53da02a4006989)) by Olena Horal-Koretska

### :bug: Bug Fixes

* Do not change props case in workflow stream handler ([ff82f9a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ff82f9a242b857f202aefc20cc3c2d11b88aaa39)) by Enrique Alcantara
* Fix tertiary button styles in light theme ([f20a0c4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f20a0c48a8e6fec489b4ed6f55c348b9be7f98e1)) by Enrique Alcantara

## [8.19.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.19.0...v8.19.1) (2025-10-08)

### :bug: Bug Fixes

* remove node specific code from esbuild setup ([6ef33e2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6ef33e281a9dded2a57e5743d132e872927578cb)) by Tristan Read

## [8.19.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.18.0...v8.19.0) (2025-10-07)

### :sparkles: Features

* add ability to tail CLI log file ([fcf1425](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fcf1425fcbdc21bbf983dc4387c41bfb60a9ceca)) by Elwyn Benson
* add simple global error handling to CLI ([6e3f9da](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6e3f9da562e853965251f041883ce2abed2e698f)) by Elwyn Benson
* Bump duo ui in agentic chat ([60a8b1d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/60a8b1d81eb390af09846705110bb2f997b43dc6)) by Enrique Alcántara
* **cli:** anthropic backend ([8b5996f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8b5996f8f60478f5c63e0a805a5b8ca5089d3982)) by Tomas Vik
* **cli:** introduce Tool TUI ([1fa9f1a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1fa9f1a7aba1645cfda20a455b5a4429fb18b01a)) by Tomas Vik
* **cli:** render messages as markdown ([1efb839](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1efb8398f0ca8d4715c82981e96d178d40bfad38)) by Tomas Vik
* unified webview init ([acb82aa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/acb82aa0043726e8829ea6ac45e35c3445428466)) by John Slaughter

### :bug: Bug Fixes

* Use obsolete catalog agents query for 18.4 instances ([c52ccc8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c52ccc84457624af5712d7535d5517e478bdcea0)) by Erran Carey

### :zap: Refactor

* **cli:** extract backend resolver logic ([972c9d6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/972c9d6526a69a283e91ca162a32796bd3737170)) by Tomas Vik
* port run_git_command to CLI ([acecc0f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/acecc0f52306e4547c1e550beb98526c11d584e1)) by Tomas Vik

### :repeat: Chore

* add dev tools mode for CLI ([740e181](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/740e181b3031afe2df7c8422220927d40af58d00)) by Andrei Zubov
* add devtools to fix CLI development ([4e18ce6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4e18ce6e3483680ce94e188785bc8e9238750dc2)) by Tomas Vik
* opt-in tsx files in CLI for prettier ([37e5619](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/37e561918536fc5cce034faeb1f788707d4a3e24)) by Elwyn Benson
* split run command in two implementations ([81ae77a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/81ae77a4f4ac6f6e2e9e361cf6f0348abf1b6d78)) by Andrei Zubov

## [8.18.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.17.0...v8.18.0) (2025-10-03)

### :sparkles: Features

* add default CLI flags, centralise env vars ([4e26faf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4e26faf18ad2a97a7e9ea63f69f7177dd45b5791)) by Elwyn Benson
* CLI supports grep ([ed82474](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ed82474b1cb91f418caf1321b6159411c7cc76da)) by Tomas Vik
* CLI supports read_files, write_file, and edit_file tools ([0851f09](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0851f099a5ff83fff337bc8fdd93bcbbf855ba82)) by Tomas Vik
* scaffold CLI headless/non-interactive `run` command ([87e7ed2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/87e7ed2f2ad21ec0c6fcd401b08de95846ba27c1)) by Elwyn Benson

### :bug: Bug Fixes

* **chat:** Cleanup refetch on timeout ([9702e2c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9702e2c6b39b9d3cb25f5960668ec958a6ea3989)) by Olena Horal-Koretska
* **chat:** Do not break connection on `workflowError` ([9a4b9c9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9a4b9c9093d332bd6e342ae71b7dd8c097e82605)) by Olena Horal-Koretska
* grep searches through untracked files ([8809d76](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8809d763209a2c209df02b478f6c6642adcfba99)) by Tomas Vik
* ignore fsmonitor changes to the .git folder ([3c58e2f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3c58e2f8d1f308a1f749786dcaaeafc0885f1529)) by Tomas Vik
* Pre-warm cache for system context items ([78dd8e8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/78dd8e87d4c861664fa2f78f6b8a63782102ec92)) by Olena Horal-Koretska
* Update duo-ui to 11.2.2 ([36b201e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/36b201e03defae60c443e4b9b8a9bf4df78b0a79)) by Enrique Alcantara

### :zap: Refactor

* extract TUI concerns from backend ([139fc5e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/139fc5eb6fa13a72c32809eb4ce3ccd535d99a3b)) by Elwyn Benson
* update CLI backend return value ([eb51332](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/eb51332541f7c71ac235da806f9b15adb2e7da85)) by Elwyn Benson
* use logger inside headless controller ([96797a5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/96797a5371e52536a8ebfbb12816e34a160b6a7f)) by Elwyn Benson

### :white_check_mark: Tests

* exact match on the output ([7809fff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7809fffaed83573517549294888ce5e0fa8d2ba7)) by Tomas Vik

### :repeat: Chore

* Cleanup unused `refetchWorkflowData` ([3d73a5f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3d73a5fc7b7bca143821add792b8cc722e8c95c3)) by Olena Horal-Koretska
* fast-follow review improvements ([d4a7a87](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d4a7a87e9049b08c2e0763f96f588b619cfe1044)) by Elwyn Benson
* update changelog to include all commits ([e1dce25](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e1dce25a827a41d035947fa2fc2e74b5167f365b)) by Juhee Lee
* update duo-workflow-service dependency, remove legacy response ([4b2a06e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4b2a06eab9ca7f4c87b324cbb2b0e34541c77612)) by Elwyn Benson
* upload sourcemap to sentry ([3b56046](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3b560461f9458e54a745b5ead1402941d18bb536)) by Juhee Lee

# [8.17.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.16.1...v8.17.0) (2025-10-01)


### Features

* Add OS context to chat ([08211a5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/08211a58e86259676ecc56c9a916eadf3a97d21c))
* CLI supports find_files command ([a0e46ff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a0e46ff2a21195c83d37af7a3d8adc6275c4d1a0))
* CLI supports mkdir ([365b5c8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/365b5c8ef529cbba3f6832bdc07d4e5f45a28f9b))
* CLI supports read_file (also stateless git access validation) ([4b69b12](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4b69b123497fe4593b3e61caa99a3c52eb5d350f))
* Further improvements to tool approval ([e9a3f00](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e9a3f00c54e1f6930cd6e8ed072a677a132da210))



## [8.16.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.16.0...v8.16.1) (2025-09-29)


### Bug Fixes

* rename approval to toolApproval in workflow.js ([b355fbb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b355fbb4c8435074db2be1bbd9243ee2f2e98631))



# [8.16.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.15.0...v8.16.0) (2025-09-29)


### Bug Fixes

* list_dir tool returns directories as well ([61e14e0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/61e14e051ba0a797112b1548e6d2b5da1f798d29))
* Use less-optimal checkpoint query for instances <18.3 ([c5b3021](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c5b3021395e1f0da64039621b35c7a60e514e1c6))


### Features

* support cwd argument in the CLI ([2d0c9de](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2d0c9de85c5d80c19abfe329bb8f2cfd91b0b046))



# [8.15.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.14.0...v8.15.0) (2025-09-26)


### Bug Fixes

* resolve query fragment error in Flows ([844873a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/844873a628a307d56aca56e0e9b53f4ded2228ca))
* Use more optimal query to fetch latest checkpoint ([90223a0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/90223a0d98cee43436a31d202c462e811b34382e))


### Features

* add custom agent selection to agentic chat ([f4c7c9b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f4c7c9b19a3217edbfe366b1e85c77091192a41c))
* **ai-config:** add session scoped MCP tool approval handling ([8396535](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/839653592f210c45d83d6ae05f228ec56536d0f2))



# [8.14.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.13.0...v8.14.0) (2025-09-23)


### Bug Fixes

* dont send Duo content twice, remove legacy field ([2c16d6b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2c16d6be7b23c2bd35a95cb246ec225d90389c85))
* replace self-referential imports with relative paths ([bfd233a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bfd233a951b3f4064b69af0cc823560c09ac5cff))


### Features

* Implement repositories provider ([ba5d39c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ba5d39ca3ab3490f78e17bb0582fa36b46d65bc4))



# [8.13.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.12.0...v8.13.0) (2025-09-23)


### Bug Fixes

* ensure SSL config changes are respected ([8784445](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/878444510412d9d4196d79b67ba948529e00f675))
* Fix code suggestions on web environment ([5eaee72](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5eaee7287284570e3103417fc835a69c25befcf8))
* Run shell env detection command silently ([46a2044](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/46a2044cfc5c84bd52a218d896a1d1710ed706c2))


### Features

* Add `remoteName` to `DuoProject` ([7b65d5a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7b65d5a8ee1450e7dcf55a30c0079d02b79cff55))
* last cli log integrated ([dd6e86d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/dd6e86d36a22aed9b0c6ee9bb26e4c3de29731d7))



# [8.12.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.11.0...v8.12.0) (2025-09-18)


### Bug Fixes

* prevent async action handlers running after stream stopped ([712cdd0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/712cdd0ce586269e7b9c2995d06c22b838564b96))
* relax websocket error handling ([529a143](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/529a14350092445f0da11b1473e06ef6778379cb))


### Features

* CLI logs are stored in a temporary file ([8094461](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8094461c6e4283b6de960f5012a64cb55507f0de))
* update revoke token path for agent flows ([f0133b4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f0133b4269428227cff7688e1a7d17f62e2da017))



# [8.11.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.10.0...v8.11.0) (2025-09-17)


### Bug Fixes

* add keepalive ping to websocket connection ([00f87e9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/00f87e9b5aa6af02e384b6d48c56ec46ae82956a))
* improve websocket error handling ([532cb39](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/532cb397ab26fa56524b020d9f830c78f08bc2c9))


### Features

* **mcp:** add in-memory session tool approval ([e7b874a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e7b874aca002025228ae6ed012b0568d1eb5af45))
* run Duo Workflow ([fb04005](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fb0400507171b29bef983b4c8ba7fa6ae182c363))



# [8.10.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.9.2...v8.10.0) (2025-09-15)


### Bug Fixes

* Do not refetch workflow when it has terminated ([d4c760a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d4c760a3490a45d438bfedf5b2feef88f5240e5d))
* Ensure apiConfigure processes PAT authentication correctly ([59ca0c5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/59ca0c502f9c9c4b459f34a680c256955b574c89))
* ensure executors are correctly disposed ([b67d0de](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b67d0de67514586a3b03de6926382f4acdc3a212))
* rename User Instruction context to Custom Rules ([e72cfec](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e72cfecb2e84d54d4c334dc60c22ec5e21f7bf30))
* Update `workflowStatus` when stream ends ([4fc6fcc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4fc6fcc7d294654659e0eade953e9a05aa918ef2))


### Features

* add secret redaction to agentic chat goal ([195bcea](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/195bceaa55a690a524e36f5b0c120dd6647faddb))
* add secret redaction to Flows goal + messages ([be278f4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/be278f43fa22635d81f8487c9da5db911b7c42f3))
* Add Shell information as Ai Context for the Agentic Chat ([ea0a2f7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ea0a2f7a05d9aba1c3b58695825011b35d8e743c))
* CLI can fetch username from GitLab API ([4663f5c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4663f5c27fa47a4b4935d346054f0e3d1d936f7a))
* **cli:** Initial TUI ([2af5fe9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2af5fe9254b13f27e00148678defbd763dc56567))
* Improve tool approval dialog look & feel ([b72f35b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b72f35bfa707fbe62beed00b41d7aa86080206ee))
* minimal chat UI ([00644e6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/00644e696b4fb1f061d763325c6efae318f54717))



## [8.9.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.9.1...v8.9.2) (2025-09-09)


### Bug Fixes

* use renamed method name for copyText ([0e1c166](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0e1c166d934562d9d4ecc65a1805bf1cc95761f6))



## [8.9.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.9.0...v8.9.1) (2025-09-09)



# [8.9.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.8.0...v8.9.0) (2025-09-09)


### Features

* Add copy workflow id button to agentic chat ([07fd19c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/07fd19c284e7a0d81efa0d1e5a96a2728d46e5fc))



# [8.8.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.7.0...v8.8.0) (2025-09-08)


### Bug Fixes

* Log action requests where no handler was found ([27136c0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/27136c0c7a721e0ca6fdc4c06efbfc86eac56163))
* Revert switchover to indirect Duo Agent Platform connections ([fc94a2c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fc94a2cf33f79a36eb0db2237a9b57f8cbb1b52a))
* use correct gid format for directory project id ([c27b573](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c27b57327ec5531319b49cd7aa309b82216cd147))


### Features

* add config based mcp tool pre-approval ([a95e372](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a95e37277fd9537124e585a628cc2a550bee2526))
* Add Linux ARM64 binary support ([ca02631](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ca02631f63a8cf00d6ffcb118b7c5ea7b032fac0))
* add more fields to CodeSuggestions instance tracker ([bfb3d72](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bfb3d726bdfe61fde4836e1cf35b922eff6f2259))
* add OAuth2 authentication flow for MCP server connections ([4b621e6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4b621e60471a9fad29e2b8b203ff6b094b45931a))
* Add support for comments in MCP config files ([4fbdecf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4fbdecf7ea7886bc653063d669f37e91a3fb47c4))
* add use git agent privilege ([de39b0b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/de39b0bc1295b815235e849ec1d72d5b50fde4c8))
* Log request ID for Duo Agent Platform requests ([110a4ee](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/110a4eefa2239d828497eb4d7b623460aa2f7758))
* update chats to pass path for terminal command output ([d1679b7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d1679b72496a84cff27cf61aecc5788506868c7f))
* Use WebSocket client for Duo Agent Platform by default ([46aab22](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/46aab22c5985912983fd66fc82432bb4ec77e23d))



# [8.7.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.6.1...v8.7.0) (2025-09-01)


### Bug Fixes

* update CODEOWNERS for docs ([a059312](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a059312ba98b48fc0ceca8a69d817b8f5b6920ec))


### Features

* Guide users to documentation in case of known connection errors for Duo Agent Platform ([10ea303](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/10ea30379c86943d7fd0ec5d88916efc769064a8))



## [8.6.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.6.0...v8.6.1) (2025-08-28)


### Reverts

* Revert "fix: emit configureapi event even when token invalid" ([b669268](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b669268fde3e34b837f3685a0f79f8ec5a398837))



# [8.6.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.5.2...v8.6.0) (2025-08-28)


### Bug Fixes

* adjust message styling for agent flows ([84f3185](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/84f31853d7166b9c15c45c8cdfd0eb08bb89d957))
* deserialize websocket action properties correctly ([4eaec33](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4eaec33c15fc3343e91738bf92a02eaa3b909d77))
* emit configureapi event even when token invalid ([8db1248](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8db1248a798e88b0989f480dcad5b95f5458fb08))
* ensure status code promise resolves ([2f4a917](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2f4a917f8d615cbf2a1b1dee38cf63170699084a))
* handle API errors in Code Suggestions streaming ([ae1a6b7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ae1a6b76dae4e81c4000eb5f9b16f461e947857e))
* resolve invalid URL for SSH remote addresses ([d1c3b80](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d1c3b80456f08fd0445e18c787fc6ab008e93e7e))


### Features

* add SPA routing support for webviews and upgrade to Fastify v5 ([6705848](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/67058481f4a1ce16cf8cba78ff1b5ff2c926f0d7))
* disable code suggestions when file is excluded ([bada36b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bada36bd0fa828fd094151d4b2147a229198487e))
* update /reset open a new chat ([b15331d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b15331db3b211b3c9093fafd89aaf8d7867927d9))



## [8.5.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.5.1...v8.5.2) (2025-08-18)


### Bug Fixes

* prevent flows/agentic-chat styles conflicting ([7225346](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/72253462efe9a63d9ca447885c6114bc1d904eeb))



## [8.5.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.5.0...v8.5.1) (2025-08-15)


### Bug Fixes

* check total workflow message size vs individual field ([3ffb4fe](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3ffb4fe47412944fa2bbe90322cbc004e6754691))



# [8.5.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.4.0...v8.5.0) (2025-08-14)


### Bug Fixes

* add origin header to agent platform socket ([ded8310](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ded83105f9ced42b05c2d69090b195377b822eb1))
* Always add Knowledge Graph plugin on startup ([29284ae](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/29284aea0a1a4a46707b65e69e0a9f9e5f2fedd1))
* apply secret redaction to agentic platform tool outputs ([de8d5d3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/de8d5d33b61839a54548dc6d461f0b74b87649da))


### Features

* Add directories as a context option ([c8a6593](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c8a65930a625cdefa5bddce3f68d948fac75ddd5))
* handle missing default Duo group in Code Suggestions ([46b0099](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/46b00996533b6ab6644a10683ccc5af5e1101b4f))
* update missing default duo namespace error body ([4f98b6e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4f98b6e5f9bed3d470e4c8669e9c81aea5cea753))



# [8.4.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.3.0...v8.4.0) (2025-08-06)


### Bug Fixes

* **api:** treat instance versions with suffixes the same as versions without ([7fe2c4a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7fe2c4a771e5e9974a735eb8448a63fe349071cf))
* prevent Duo modifying files which have changed since last read ([2178709](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2178709f18504c02cf480cacf622c64259c3c94f))


### Features

* add mkdir action handler to node executor ([4332a57](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4332a57224defaf2d5050b1c0ef9449a2e53b54e))
* use ide diagnostics in edit_file tool response ([932a536](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/932a53648978396a072137d7fa10805c08d36849))



# [8.3.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.2.0...v8.3.0) (2025-08-05)


### Features

* Add `AgenticChatInstanceFlagCheck` ([238cf9d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/238cf9dd154b6ea1753de4b3bdd216f30e0b6721))
* Add `FlowsInstanceFlagCheck` ([769d6b2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/769d6b2ac65a877142238990f5b8b0d263a8035d))
* Add `onChanged` listener to Instance Feature Flags Service ([ffed3de](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ffed3de01960832b27d05181e7166daf844f3384))
* Update FF service to handle instance version ([bc0b043](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bc0b04376d7451273be079c156d3dbc4b207905a))



# [8.2.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.1.0...v8.2.0) (2025-08-05)


### Bug Fixes

* Ensure agentic platform WebSocket works if GitLab is hosted at a path prefix ([700b2bb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/700b2bb7989802089d099851b1b3cf53135cebe2))
* Pass proxy/https agent to Duo Agent Platform WebSocket client ([2dbf505](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2dbf50518a00e5ba4dad2c61a633d301a7076e1b))


### Features

* **chat:** support namespace in agentic chat ([c822b4e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c822b4ead0369695cb0e66ad58455db55c9edd74))
* read multiple files ([1ad6811](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1ad68118ac5b380ca8aca2625d1b4cb72618bedf))
* Separate connection details from direct connection details ([f31bc64](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f31bc6462a6d257ec760d26b479ec303d0f236d5))



# [8.1.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.0.1...v8.1.0) (2025-07-30)


### Bug Fixes

* Deny edit access for configuration files by default ([6f241b5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6f241b5d96b2e746ceb26191dfe17f54e44c0a61))


### Features

* Add Duo Chat API health check ([81c54dd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/81c54dda65cd0e27397834dca1543ecd1ecd99a1))
* **mcp:** support multiple mcp config paths and merging ([159e4ba](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/159e4ba83f78a19f5ef8ccbc78cb5bfefd8e7b43))



## [8.0.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v8.0.0...v8.0.1) (2025-07-28)


### Bug Fixes

* Fix lost token when switching agentic tabs ([c611d96](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c611d96396e7a4905e7ae7e74f63278c6dd5ff7c))



# [8.0.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.54.0...v8.0.0) (2025-07-28)


### Bug Fixes

* Apply latest security fork changes ([b3a7645](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b3a7645d042c2122abfddf8ff8d8ac7969db7bfe))


### BREAKING CHANGES

* Only host extensions will provide valid authentication details.



# [7.54.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.53.0...v7.54.0) (2025-07-28)


### Bug Fixes

* don't follow symlinks out of repository ([321fc03](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/321fc039723b05fd49cbed91b11c7f91e8f50293))
* fix isomorphic-git unsupported dircache version error ([ec11449](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ec11449e523d934e3e64f03c3dfe9925ff19027f))
* use gl-icon in healthcheck ([5f34989](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5f3498949d495e1b188ceed7e95df02853c36f70))


### Features

* apply Duo Context Exclusion ([4e870ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4e870ad8596ddb86ca97ec3b33ba2cb8b410f1d1))
* introduce system context ([cbb269a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cbb269aa71998af6ad4f4701a4a521fbf6e62d4f))
* support avatars from gravatar in the webviews ([0965d7f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0965d7fc945de0dba083315fb502ff4ef8ebcbe0))



# [7.53.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.52.0...v7.53.0) (2025-07-22)


### Bug Fixes

* Agentic Chat, correct /new slash command to start new chat instead of canceling ([2d58b63](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2d58b631ffaf04f9f0478a78d5b0f7ab41f7c8ce))


### Features

* add websocket support for workflow / agentic chat ([f4576d5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f4576d5736f8a3eae9c03180b4422f1c35a15da2))
* fetch chat history independent of a current project ([f59f0a3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f59f0a3d0f12ab1a75bf4c7f47314e366a3f905f))



# [7.52.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.51.0...v7.52.0) (2025-07-17)


### Bug Fixes

* agentic chat error styles, update duo-ui ([82ea11b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/82ea11b7b85e25aeefd8dc679442226b144cf8e5))
* **agentic chat:** custom rule debug logs looked like errors ([80591c1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/80591c143606092e3d6250fd2e248a7aa1019903))
* allow users to continue previous chat sessions ([650fe6c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/650fe6cd5327068e3472a9938c74cb6334709d31))
* Attach additional context when replacing user message ([9162b31](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9162b31f37176d74b0a3f54d870a4c46f2c05388))
* Fix chat health check state ([7e31be0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7e31be0a051533fae07f132b33e98d9d83390aa7))
* Fix navigation bar links opened in browser ([7d5197b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7d5197b1011599299954740e263834eb153ce611))


### Features

* add duo recent components to agentic views ([78165c9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/78165c9250338bc6a2d42755d25740c3dca3780e))
* allow command action to run elsewhere ([903afbe](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/903afbe691d33a8933b73184e4a1bae1045fa56a))
* convert prefixed mcp server name to underscore ([eccf79b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/eccf79b0f35240763a9ad7e20bf34126781d02d6))
* do not respond to NewCheckpoint message in node executor ([40f3316](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/40f33166a1a66f1460c73604c085ab9551d8fa0c))
* introduced the user service for Duo Agentic chat ([eaf0ef5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/eaf0ef53322b7bae91e90fb6b8198e855acacfdf))



# [7.51.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.50.0...v7.51.0) (2025-07-16)


### Bug Fixes

* fixed new thread appended to the old thread ([565eaba](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/565eaba19ea98a57d90df7ecf6ff04264166c378))
* Keep connection details global context ([1e3ce5a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1e3ce5a1e59455d62b9357b472f702889124a275))
* **kg:** Remove Knowledge Graph from managed web view list ([0a57fca](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0a57fca1459737a206fff033384e00c503ead14f))
* return error if grpc response is too big ([8038843](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/80388433e04dfdbb61899817126e6e800bc18239))


### Features

* **kg:** register Knowledge Graph as plugin ([c208b0e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c208b0e93da387a63e518668ad1761ff8d1a8887))



# [7.50.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.49.0...v7.50.0) (2025-07-15)


### Bug Fixes

* improve various error handling scenarios ([19ec260](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/19ec260becad08c7ba832aca56db2f201101b7ee))
* **kg:** remove LsFetch from Knowledge Graph client in favor of cross-node ([7366fcb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7366fcb37b7108fbda3b20d29788c2123f4d150e))


### Features

* add navigation-bar to tabs and duo-ui to workflow ([6a1808f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6a1808f99b82348246d3be58b89ea2818fa853e7))
* allow agent to write to gitlab and mcp tools ([68832fa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/68832fa107f9fff22c925635e0d7f76e42e6ab8a))
* mark the archived chat threads as such ([d8cdc38](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d8cdc38254cbc5af1045b7fbaa5419188d7d3e74))
* remove tool approval FF ([9d44fe8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9d44fe8bdd134248d24ea66640d573c0de97a123))



# [7.49.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.48.0...v7.49.0) (2025-07-11)


### Bug Fixes

* upgraded duo-ui dependency ([5fc69da](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5fc69dad5d9c361016558ef788f27d5916c51f9d))


### Features

* Add agentic chat support check ([e7a0892](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e7a0892ba86cdb772821e44300cbdeaa234666c1))


### Performance Improvements

* parallelize createWorkflow and getToken request ([c26d415](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c26d4158364de24953109c0cb7d3f97ff6ef2534))



# [7.48.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.47.1...v7.48.0) (2025-07-10)


### Bug Fixes

* add correct api prefix to merge_request path ([cdc7014](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cdc701411719761685e89a3e24d935b3d9adac53))
* Broadcast keyboard events from nested iframes ([ec6cf69](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ec6cf691309c521a0656815a8828758227bf9d95))
* **kg:** remove Knowledge Graph zod schema ([da6e1bb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/da6e1bbd24aad56b8d15e9d4760bc32504b1e2ed))
* open files in IDE when path is clicked in agentic chat ([d1d8b8a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d1d8b8a641d6e6a1300c50765b25afd958360dd7))
* update chat status on failure, try to prevent loading forever ([bac09e9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bac09e9bb34e341ff58b3437e67a2b76090d2e01))


### Features

* Add `onChange` event listener to feature state manager ([e0ff5af](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e0ff5afc841def9d8ab7406b2ba1dfc80b4cd687))
* Add the environment to workflow creation ([773e586](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/773e58692e9eb69a4e0e6c51e1a3874064e9a941))
* agentic chat inline tool approval ([7717fb7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7717fb7cc749b5588a6268ea6e552bd7f0efecbc))
* Always Enable Instance Telemetry in Self-Managed Instances ([99eceac](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/99eceac56b878e3d700e3bc7deed38a7c182400b))
* Chang tabs visibility based on feature state manager state ([b0e6c4a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b0e6c4aa5a3f56ea637caf8ce3fccfedb645dd4d))
* **kg:** allow sending gkg path via configuration ([7c18ac6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7c18ac65fe687d68eb99e44469a426e5476094da))
* support copy-message functionality ([39d4efc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/39d4efc425b5c89c130df7a89cf966af00a79456))


### Performance Improvements

* pre-create workflows for agentic chat ([91821bd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/91821bd9945dfdd91e1bca659b8902c2a8a5d52b))



## [7.47.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.47.0...v7.47.1) (2025-07-04)


### Bug Fixes

* remove user-rule context from duo chat ([76afd46](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/76afd464abfacf722696190c0a2d7fe3fb527807))



# [7.47.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.46.1...v7.47.0) (2025-07-04)


### Features

* Create Agentic chat availability policy based on user setting ([7617f4f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7617f4f0c9dac61bd4adfe0c77fea1b3be033805))



## [7.46.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.46.0...v7.46.1) (2025-07-04)


### Bug Fixes

* Remove invalid type definitions ([e3db3b3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e3db3b35834403dc329badd4855392391c3445a9))



# [7.46.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.45.0...v7.46.0) (2025-07-03)


### Bug Fixes

* Respect TLS and proxy connection options for GraphQL subscriptions ([e3494a9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e3494a93f867ea5e1af2117e92d3c349373846e7))
* use lsFetch in DirectConnectionClient to respect proxy settings ([3ae191c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3ae191ce9e3c143ae168598dd09d0deee0009e81))


### Features

* add document quality service and RPC requests ([a24e10a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a24e10afa3b3705761843181b99c8a033d2aeccf))
* Create two-tabbed view for agentic apps ([e82a808](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e82a808c811f1e1e1179c36f8ea7638d0fefd141))
* **kg:** Register Knowledge Graph to duo mcp.json file ([d196ff4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d196ff433d4c7789f8bb37d65521b58cf9c3edfa))
* **releases:** include author in release changelog ([69a6f14](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/69a6f14dfa7703433b91a62a637bbdc94d2092ac))
* update content from Duo Workflow to Duo Agent Platform ([c921794](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c921794ed56ef1724012ec1bf7f63ee4a54c1f7b))



# [7.45.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.44.1...v7.45.0) (2025-06-27)


### Bug Fixes

* include X-Gitlab-Saas-Duo-Pro-Namespace-Ids value on every context update ([bcd103c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bcd103c95aeec82578c61b77bcb84a4d5f130308))


### Features

* Duo Agentic Chat - user provided rules ([2feca8b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2feca8b720cd81b0b19bb80d4d4fa2ed7b936866))
* Inform Duo Workflow Service of client version ([1c316c4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1c316c42eaf4392e713a9442309aa8026f10e0e5))
* **kg:** launch Knowledge Graph HTTP server on start ([a8ac318](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a8ac318b15262b68506fb7f92c882792ff8fe581))



## [7.44.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.44.0...v7.44.1) (2025-06-26)


### Bug Fixes

* fallback service can access class methods ([04c7eff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/04c7eff08d7d1e83b321d17601f77f21c9157b5b))



# [7.44.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.43.0...v7.44.0) (2025-06-26)


### Bug Fixes

* add tokens to cached code suggestion ([d09a919](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d09a919085255103b5fd96185cc6dc86b1c3f7ca))
* Fix steps count in workflow ([718ac4f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/718ac4f8bcbd8a40f8a914b211e961e8e8fa4bef))


### Features

* allow removal of the workflows in Agentic Chat ([9f28cda](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9f28cdad53b2f89750980ec59ffa0e0ba15641d5))
* bump version of token api ([b676583](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b676583fe182e17e4cfe06b98a9cdbbba0cdbdce))
* enabled agentic chat history by default ([09e888d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/09e888d0819685811b3f70465a2a87d8e31846ea))
* introduced the Recent Chats panel ([6fb1608](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6fb1608bf5258fe7c8000dc80f5bdb1667ff6a67))
* replace FE user message with `uiChatLog` user message ([175e68a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/175e68a66fc76ebc26ea795996aa165327c46c4e))
* search for the History of Duo Agentic chat ([b25c732](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b25c732ec99d0f0a2811d7009500fffc1ca1a9cd))



# [7.43.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.42.0...v7.43.0) (2025-06-23)


### Bug Fixes

* cancel the running workflow when starting new thread ([44d7c2f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/44d7c2ff4096bb3897b6601811d2c6d2c4022932))
* Duo Workflow regular poll ([8f79c00](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8f79c00cc90b57c334f578adf75f6b16b2d03cf6))


### Features

* add tool approval workflow for agentic chat ([11032a8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/11032a867e68a6ab0e89534eaac2ff6e7872a4d6))



# [7.42.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.41.0...v7.42.0) (2025-06-20)


### Bug Fixes

* Clear `AIContext` after runing workflow ([da13192](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/da13192d2dd404f9a75a3921e1f14863a07f8bc9))
* Code suggestion replaced with another when hovering first suggestion ([d2fbd13](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d2fbd1373fd383706d53b6078e9510be1ea28738))
* handle executor errors properly ([d23605a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d23605af88ae97a9314aef507a42358a7cade315))
* truncate `contentAboveCursor` and `contentBelowCursor` for Duo Chat ([426701c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/426701c8e6b00403eb9b934d7fcb7ee2726f2ee7))


### Features

* Add AIContext to Agentic Chat ([3a11314](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3a113144c0f2a204e3b14f9aa50ae00745181ad2))
* Add editor selection context provider ([d728433](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d7284335ed318ca32e29e22646e50194e4a4255c))
* add feedback form to agentic chat ([f964ddf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f964ddf09f2eb8804ec260f7f756f468e7de10e1))
* Control Agentic Slash commands by client FF ([1a312f8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1a312f89fea7e1749b90f4f6526de83bfa9b540f))
* Display default slash commands in chat ([bfffcc6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bfffcc6d85d4436f7ace0976952b9a4eeedc3f56))
* duo agentic chat history UI ([9333b1b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9333b1b1b6f9dff849026dea404952b86273d56f))
* listen to the switchView notification from the extension ([60e2438](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/60e2438b9cf0cefb15472a1f8c421eb963d750b4))
* Start new chat with `/new` slash command ([4bea734](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4bea734ca2631a2557716feb42b624213ce88df0))


### Reverts

* Revert "feat: allow command action to run elsewhere" ([4ac3342](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4ac334205ee3eeab9499ef20b616db46f52aa225))



# [7.41.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.40.0...v7.41.0) (2025-06-13)


### Features

* allow command action to run elsewhere ([4a955f8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4a955f8af69cc91c31700e0cfe0385d23560a1ad))



# [7.40.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.39.0...v7.40.0) (2025-06-13)


### Bug Fixes

* add error_description from API errors in error messages ([c9a16b4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c9a16b43ac6dab412c7c034a233f9cf06ccb5f79))
* correctly log GraphQL network errors ([f1aded6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f1aded6743c6fee88fb59aebc45b414b6e7ddca9))
* make apiStateCheck.isSuccessful accessible in diffEmitter ([1f70101](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1f70101071ae77b0e082f99af7bf6ffaa2a1a3e2))
* More helpful and accurate warning for links ([7a19808](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7a198083871597f4ae0f4b7bef84ee3002f34655))


### Features

* pass AI Context Items to duo workflow ([2dd2607](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2dd26074491c39e53d30739acd8206f955e9cf5e))
* split token call for chat and workflow ([5b9bf78](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5b9bf78912c27bf1f3a7548700110950a46e0b95))



# [7.39.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.38.1...v7.39.0) (2025-06-04)


### Bug Fixes

* avoid API configuration race condition ([9fede1e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9fede1ecf1dca1207e5f318f19bd2bf367a847c9))


### Features

* Add support for Streamable HTTP Transport for MCP ([bde2ccf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bde2ccfbd4a552e9140ee065878d2032fd04dfb1))



## [7.38.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.38.0...v7.38.1) (2025-06-03)


### Bug Fixes

* use markdown renderer from Duo UI ([ea189f7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ea189f78846affa09eebcdb00a7482b3adb104a2))



# [7.38.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.37.0...v7.38.0) (2025-06-02)


### Bug Fixes

* Workflow workaround for svgs ([f59275b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f59275b8a8456eb01c860033fb11ab83dada5814))


### Features

* Add repositories to context options ([24f49cb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/24f49cbba41b6c76bd123eb97579285a2c37c415))
* Added implementation for MCP Manager ([986e74b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/986e74b9368ed41f0ba8e6c4735c6dfd57b36785))
* Duo Workflow - add feedback link to top nav ([f2a8d50](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f2a8d50af2facd56843fa6184acd63778f22c39f))
* increase text limits for goal and messages in Duo Workflow ([05cfb59](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/05cfb59f50cda570d9d6b7346746d7d73b8037b1))
* Support for MCP for agentic chat ([417b7c1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/417b7c1d171c9388aa3c4058e72c7fbe63b1d607))



# [7.37.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.36.0...v7.37.0) (2025-05-28)


### Bug Fixes

* avoid checking token before client sends it or when token is empty ([f17cbb1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f17cbb16a1b414f247cc4b891257d7c4005bddd0))
* Duo Workflow messages out of order ([426e605](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/426e605f1194aca60530b15f359ef8f11c308ce7))
* duo workflow panel pop ups ([5747a45](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5747a453c15e04d5be1b07e2d82e061534f27b98))


### Features

* Duo Workflow - Update plan layout ([d5bed9e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d5bed9e9a4f8f7ef348ded52ebcc137e3482db61))
* Duo Workflow supports undo ([479b51a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/479b51aecb631fb4a887226aeceb00d993138101))
* give the agentic chat webview a title ([bbdcc48](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bbdcc486667edd66804bbc3acd649c603873c15d))
* implement interfaces for init and handling mcp tools ([77f447d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/77f447d4dec73cb031dc58db0d6f9c1d87cd68dd))



# [7.36.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.35.0...v7.36.0) (2025-05-23)


### Bug Fixes

* handle no repositories for workspace ([e595351](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e59535131b11897f550c09fc0b72582c0ca93aa2))


### Features

* add copy workflow id to workflow nav bar ([1caa6bd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1caa6bdc410e44106f0a8ecdfa432a969e3fafae))
* Enable seamless Duo Workflow iterations ([75e534b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/75e534bd590321be665611d11562c636d9493696))



# [7.35.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.34.1...v7.35.0) (2025-05-22)


### Bug Fixes

* update workflow query display by type software_development ([fe7d2d1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fe7d2d1f36f1fb0b3dfcfae1a60e121c0c3c2bf5))


### Features

* enable node executor by default for duo workflow ([e53867a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e53867a9bc87622795f75be0132477b586d403bb))



## [7.34.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.34.0...v7.34.1) (2025-05-22)


### Bug Fixes

* marked the Agentic Chat webivew as experimental ([1f84ba7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1f84ba70010c363acb916bdde6edbe7faad0e930))
* pass all necessary metadata to DWS ([292a82a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/292a82a9944a67dcb04a623f09887f397045860c))
* updated duo-ui to 8.16.1 ([f897b40](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f897b409b70f483da224b49ce6a5564186e6ec8d))



# [7.34.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.33.0...v7.34.0) (2025-05-21)


### Bug Fixes

* Do not send workflow events for chat ([5f94803](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5f94803d5608d5f170dad99b8cccf40b8a42737d))
* ensure only one executor instance per workflow ([a92d360](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a92d3603029c42e9a1c4c3ac6c8dc7d486126aeb))
* pass feature flags to duo workflow grpc client ([19ce207](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/19ce2077e85885b40748bceded8013158c040bd8))
* use correct casing for workflow telemetry property ([5b8c51d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5b8c51df2d65da235c6302e2dd2702078519ecd5))


### Features

* Duo Workflow - add back old status copy ([1dbcfbb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1dbcfbb23dce09452918864ecd94af0287cf09d0))



# [7.33.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.32.1...v7.33.0) (2025-05-20)


### Features

* Add feature enablement type to snowplow events ([18a2d25](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/18a2d2592f9df70f542f14d3a287d439470713c3))
* Adds `grep` workflow action ([8e9375d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8e9375da6f5dbebcc6b768c2a51a763c48b4f669))
* handle list directory workflow action ([20a8d30](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/20a8d30a8bfa72487c67242fa4ba69e43c07870f))
* support find files duo workflow tool ([129111e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/129111e1d1c9b968da40c993a6f2a17a47a00c8c))
* update duo workflow list styles ([b683cb5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b683cb532951ea53d40a8a3da130bbc50f78bd4a))



## [7.32.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.32.0...v7.32.1) (2025-05-19)


### Bug Fixes

* rollback npmrc changes that affected the release process ([cd10b0a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cd10b0aed9fa8593ebe7e39a05738de9d8730086))



# [7.32.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.31.0...v7.32.0) (2025-05-16)


### Bug Fixes

* clear duo workflow chat form on enter ([79af397](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/79af397fc983aabc7530f68ce179827d37371597))
* correct token expiry property ([1bcbf9f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1bcbf9f3228cd435847d5d913c446e7634d50b92))
* fix alerts in duo workflow show plan page ([bef35b8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bef35b87479554ce4ca3a7f83ccda801c0ce9909))
* Refetch workflow to avoid "stuck" state ([6cf975f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6cf975f702cf1ca8da06781c088333a3be3fa16e))


### Features

* add remaining duo workflow action handlers ([06e2dfe](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/06e2dfef0156593ad800bf21d7e57453ed21e976))
* Add Workflow plan panel ([e2a7061](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e2a70614e253fb87a7d9da7fa78f62c873943818))
* Handle copy/insert code snippet ([0d787ff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0d787ff178d2bccacc29b7cda75ef571d40eda6c))
* Handle link opening in agentic chat ([faa7fa2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/faa7fa2d6c702f6c203bfd5c1b78d5f53accfa2a))
* Handle workflow errors in chat ([6fdbc68](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6fdbc6874ffbf0e9ce5e8c1fc4716449eb136f89))
* Implement retry mechanism for node executor ([3dcf4f8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3dcf4f82fc3d040178ac1382f9350748ff81f7fa))
* improve duo workflow health checks in sidebar ([d89a9ed](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d89a9ed378960aeef70532c8848882c645efc4a8))
* respect gitignore in duo workflow tools ([9c2c43c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9c2c43cb01f4fb4aa9e007007a64863a2cc6770d))
* reuse token for agentic chat ([0d560d9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0d560d98236dcbd49d9d7385e0f2155a3bbc067e))
* set team member flag in workflow executor ([1296568](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/12965688f11bee9e140d482eade24bed7efde32b))
* update workflow UI when using node executor ([8c9a38c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8c9a38c095241d00f1985f4fb71cc7f4960d33e8))
* updated duo workflow home page styles ([2fa37ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2fa37ad0c522adefe018cf9a089932d84a3dcbe2))
* use new duo-workflow-service Node.js client ([26dd653](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/26dd65393b6a49a1ff08a45e7a6cd4f23125fa5a))



# [7.31.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.30.0...v7.31.0) (2025-05-07)


### Bug Fixes

* add more cancellation checks on suggestions ([897ddc2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/897ddc2c2f6dcec19ae5735e859fde01c2ad5c4e))
* Fix streaming on staging ([123ffd6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/123ffd6279a728ec90056fac01a9adb0fdb4c6aa))


### Features

* add initial duo workflow node executor ([5f1ad47](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5f1ad4771f05d0a1cbf5a4bd9a6cac082a99a3fd))
* add read_file action and actions structure ([f066042](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f066042b1437ac8bd1a97a09b279534459cc214c))
* Duo Workflow - New page layout and navigation ([f95e9f9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f95e9f944b5952ef0e82ea73b1cb641850cccad1))
* Duo Workflow update tool calls style ([ad84e9f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ad84e9fd70ec144af9327eebeb4d1f60e3cc1fa3))



# [7.30.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.29.0...v7.30.0) (2025-05-01)


### Bug Fixes

* send project_path for model_details ([e98c252](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e98c252c527a3374a6f90a1125c45c31fdeb9f1e))


### Features

* add duo workflow gRPC client for node executor ([6e6d463](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6e6d463c67b997acc7589fe905deeb5dfdbdca25))
* Stop workflow from chat ([1411ecc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1411ecc7066b5fee1d40a8966f50784e3c1b8f4e))
* Update failed state end message and display in workflow ([b504533](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b504533dfd741d823abd8aea34b77bd7f495a256))



# [7.29.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.28.0...v7.29.0) (2025-04-28)


### Features

* Add Duo workflow tool approval ([65de1a4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/65de1a400fbc232d0a28a7b1f959ba1a5c71f3c0))



# [7.28.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.27.0...v7.28.0) (2025-04-25)


### Bug Fixes

* catch errors when updating workflow on fail ([d394bf6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d394bf6af0a003721624cc001742482be2a67b07))
* Cleanup duo workflow ws listeners ([0603d07](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0603d07daeed25b276a2aa03ad5848da26b17566))
* Duo Workflow old checkpoints displaying ([bc54d45](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bc54d45ce7764c1b5d53ebef98ab3fff13286ade))
* gracefully handle failed API request (GitLab version) ([3ef7198](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3ef719882922757315734f32cef4280961f88a59))
* retry failed license requests ([e786ee5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e786ee5a459fa12c0f2ebe76dbca2f79f690bade))


### Features

* allow users to easily follow up on workflow ([ffeaff8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ffeaff805056483eb1c6f2297ef23a4e93796622))
* Duo Workflow - Reverse message order ([9f1c97d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9f1c97df93cc435d8e4505466c0499b7879062cd))


### Reverts

* Remove agentic chat package ([777524e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/777524e79d9a9da81288a648d9608c4ab8ea4fac))



# [7.27.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.26.0...v7.27.0) (2025-04-17)


### Features

* **workflow:** set the last user message as workflow goal ([0eb2e4c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0eb2e4c37e6d5385c52ae5765634cd58ae5374bf))



# [7.26.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.25.1...v7.26.0) (2025-04-17)


### Features

* **workflow:** use graph setting for executor ([05b2d1c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/05b2d1cf2605dc63502a3d7217fd588f006b7b94))



## [7.25.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.25.0...v7.25.1) (2025-04-15)


### Bug Fixes

* apply theme overrides to user message ([687f983](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/687f983cf30ed9c15e1dd1205cd91eeddf2aeeb8))
* Implement subscription retry for workflow ([7c64b2a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7c64b2a16d3ee93faa6dd07f148dfa324892a237))
* Refetch data after status to needs input ([3b893cc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3b893ccccc6c13e1d2b0d41d656cb9e88c9fe3b8))
* remove full width for navigation causing wide scrolling ([e476738](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e476738f367c7923f1f94620a025e0ac9b38f7ad))



# [7.25.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.24.0...v7.25.0) (2025-04-10)


### Bug Fixes

* don't disconnect workflow event subscription on completed workflow ([41209ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/41209add487e8161f7d8aadec011ca12946f4d9c))


### Features

* add status checks for Duo Chat explain_terminal_context ([cf6112d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cf6112d5f1add658c7598494a2943c193200f592))
* handle explain terminal messages ([a432582](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a432582dad65c289b48d3e67a5b415499a2be528))



# [7.24.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.23.1...v7.24.0) (2025-04-08)


### Bug Fixes

* change paths handling for assets ([5fdf8b9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5fdf8b96324279dd700f1eea94f6ac7ee47709f4))
* Correctly relocate Nuget content ([a47bfd5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a47bfd5b786c222ceffefeef7e342d24323c3afa))
* Duo Workflow - Double subscription when creating a workflow ([d088aef](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d088aef475794fddf4a3f4f77403f757534b9139))


### Features

* add terminal context provider ([48092ff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/48092ffa9075565005d9d1d61bc658560e2b23d8))



## [7.23.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.23.0...v7.23.1) (2025-04-03)


### Bug Fixes

* Update webview asset paths - temporary fix ([d4e7192](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d4e719273e7a73e836f4b9b4b3b8b1834f87b833))



# [7.23.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.22.1...v7.23.0) (2025-04-03)


### Bug Fixes

* fix codesigning script ([49ed9ea](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/49ed9ea85beb9c3e99e21e17c5692c8969f21e36))


### Features

* Add Duo Workflow polling fallback mechanism ([f998cad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f998cad05fea096d86a53355a3051797d1e650e4))



## [7.22.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.22.0...v7.22.1) (2025-04-02)


### Bug Fixes

* fix alert positioning in workflow ([ce43e8b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ce43e8b36d37d66a390cd7868c9d528bd80e214a))
* run correct publish job ([d86cb04](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d86cb04e74727bfdcdea6663217a0ed47d6e05d2))



# [7.22.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.21.0...v7.22.0) (2025-04-02)


### Bug Fixes

* Track `suggestion_shown`  based on client config ([c6560cd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c6560cdb1c0bbffc697eb84447400fc959b017f8))


### Features

* Add classification "duo" for Duo event definitions ([db4786c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/db4786cbbe39c2058c1cd8927904ed0a7ef82e5d))
* Duo Workflow pass metadata to executor ([e3aa9d3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e3aa9d34680508ceabef56d0934ff69d5b774aab))
* Provide project_id while tracking events via Instance tracker ([759aeca](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/759aecafe68202505893533642b1f2bafb02abb9))
* update autoscroll in workflow messages ([0b34a7f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0b34a7f076a263c51affa9fbd68669dfe89b45fc))



# [7.21.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.20.0...v7.21.0) (2025-03-26)


### Bug Fixes

* abort API configuration when new token comes ([7d64722](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7d64722d044b83ef59122f21806f7e2cf86171be))
* Add background to Workflow Navigation ([f485025](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f485025200879f72269bac7fadd92ca9b53ee6cd))
* log chat prompt errors ([fa7b0a8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fa7b0a82107326a209b5ca33e1effbeb37e8ae8d))


### Features

* Allow to abandon workflow if not agreeing with plan ([4a3f4d6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4a3f4d691fcc8bce6b03ce04ca3b572342a0b889))
* Duo Workflow handles executor exit codes ([bd9a604](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bd9a604865edf64498fc2ca614fbf8e5f142d40c))
* remove scrollbars from workflow chat ([b759d7f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b759d7f1c982ff66af99fd8ffa086355b057447c))
* replace plan skeleton loader ([6168c7e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6168c7e3dafdf8f55b49f193b73df95ceba60c3c))



# [7.20.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.19.0...v7.20.0) (2025-03-21)


### Bug Fixes

* fix popover transparency on experiment badge ([e21c761](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e21c7610f4525e9990ebc9b20da9bc139523b3da))
* only process configuration update if there's been a change ([c0ce6da](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c0ce6da838cd91382402badc35c8715ab4ee18ba))


### Features

* add learn more link to prompt and copy changes ([da434ca](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/da434caaf8c526b3441227e4525a12c826e052cf))
* support resolving Node.js built-in module imports ([b630f6a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b630f6ada4369f2a90770e95377cea6a57db5394))
* Update GitLab error screen with docs link and refresh button ([2475613](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2475613e0fad2cf0cf6d9a6cf3be594bb4c0c632))



# [7.19.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.18.0...v7.19.0) (2025-03-18)


### Bug Fixes

* Add workflow transition action retry ([cd87f45](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cd87f45e4169af11e18fa4a90012fb1ffe1616f0))


### Features

* add tooltip to send message button and filepath size ([e9744f9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e9744f9ef907115e5e1b49c0f6d17365ee2172bd))
* add workflow_id to feedback link ([99e032e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/99e032e54dc1756d430c427a87a51e16fbf6ad50))
* allow longer messages in duo wf table ([da2348b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/da2348bf6f470811062de2929620440c7aa67b6b))
* fix chat size in duo workflow messaging ([19431c1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/19431c1cafe72379e50437f1d251dff90d902fe3))
* fix dashed buttons in duo workflow ([a65992f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a65992f6cae0b0920d2a9009d530d2e2bde02f71))
* handle REQUEST messages for workflow ([ef72ffe](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ef72ffe7c446b5a1c78f50c9d2de2bc327c127ee))
* only display text when over character count ([b606660](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b606660573b41e8dffa0277c612393fd8f5a4e67))



# [7.18.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.17.1...v7.18.0) (2025-03-13)


### Bug Fixes

* Allow user to stop workflows in needs input ([8ec2d5d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8ec2d5d3ac4f8b2735593c80134c9c93344c11d2))
* correct font size of code blocks in workflow ([ca864a4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ca864a4c9830c93f7481408bcd1b1323d07b297e))
* correct font size of code blocks in workflow ([7e4ff4a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7e4ff4af81876f5a6df022cfe98edd9abbdac24f))
* Duo Workflow overflow in plans ([d55af7d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d55af7d143618f5d7b694142510020758ee286b8))
* LSP build for Web IDE ([1de8e20](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1de8e2005837bb09374229f685385af464bc63e1))
* Send duo workflow chat message button ([190a12f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/190a12fba018b96c5b80b1dd4eca6c293b0fa9f2))
* use correct origin when calling connectToCable ([77609bc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/77609bc4ca5d8693d6a6bb1af76fbb7ed9afe3b6))


### Features

* add full width to duo workflow breadcrumb navigation ([e2f86f4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e2f86f40b1e1fc4574079bd31ddd7206a5d3dee2))
* add Submodule support to RepositoryService ([024c387](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/024c387d269e71562afa5bce30270c5c9025fb65))
* Create Snowplow Event definitions for Editor Extensions ([42a7a3c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/42a7a3c15f4a0cc91e8160b56d8ccf66e9d5de27))
* Duo workflow render markdown in plan ([202a052](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/202a0529dc5ec0eb4678ff6faf3bb7110424c708))
* highlight message when workflow needs input ([5daa794](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5daa7946a429e87632234e1072880ac339619b6b))
* highlight message when workflow needs input ([76aed55](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/76aed55bf7cfcf7a6f8fd8a85ac659856cf963f7))
* Indicate progress in the chat of Duo Workflow ([467d828](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/467d828457d61a27e5bdcd0fd6973b272dbe4408))
* Indicate progress in the chat of Duo Workflow ([cb42709](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cb4270960f2a3039918237a18b0f46ac892bc8f5))
* remove toast from stopped duo workflow ([52a7f42](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/52a7f42efd755d57ba5c7f3975c5735bb78306bb))
* validate chat message length in duo workflow ([9268bfc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9268bfc12788e3f2ab8058220f824fe0b6543f1b))
* wrap file paths in code blocks ([e166344](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e1663442a64ea7bd121d5913494ed2ebe030eec7))



## [7.17.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.17.0...v7.17.1) (2025-03-05)


### Bug Fixes

* add DisabledItemPreProcessor ([8a553b3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8a553b3db2f520b88578f0238bfe4ebde46d853a))



# [7.17.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.16.0...v7.17.0) (2025-03-04)


### Bug Fixes

* Send duo workflow chat message button ([caacaaf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/caacaaf82ae8bb0ed04cd9ab9fb9e2822800d8c1))
* use url.fileURLToPath to convert file-url to path ([db51fa6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/db51fa6e109e67c30fd416c3fa4506aadf161330))


### Features

* add context-ranking processor ([44cc62b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/44cc62b080d90fc325f7a7db1665daa4fc5ce9c3))
* add resolution_strategies to code suggestions telemetry ([b10e12d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b10e12dbb58639f05a752816bc584cd9b37d1832))
* display links to files in duo workflow actions ([5ee648a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5ee648a04aaa0c7c5ccef4ad9f34511e496d9d29))
* Duo Workflow handle multiple input statuses ([12337ee](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/12337ee2db05ecdcc63b51eb3e30a2d57de27246))
* enable ImportContextProvider via Feature Flag ([1c4efeb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1c4efeb5bd9f1e71477d52b05cdc7b5608204086))
* Hide Duo Workflow chat unless in needs input ([2b5fa57](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2b5fa578faeb261824f6de0d80f9c4f6523d8733))



# [7.16.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.15.0...v7.16.0) (2025-02-27)


### Bug Fixes

* export AIContextSearchRequest type ([8e83899](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8e83899937883f69cd876ebec698a6bfba264a37))


### Features

* add configuration to use docker for workflow ([6dcaee6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6dcaee69d29c52f488fa2a237cf218be6ace143e))
* show workflow end message when finished ([bdb5551](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bdb55511991d1941f3e73b7cce51c7cade697bf6))



# [7.15.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.14.2...v7.15.0) (2025-02-24)


### Bug Fixes

* Duo Workflow hide current step when done ([0190217](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0190217e2e8b5fa01351e25afe33b4f0cb3cc6c2))
* ImportContextProvider should return file URI instead of fsPath ([a0b7dae](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a0b7dae6373b06225e7fa05ae0782378ad69ed4b))
* Prevent duo-chat-v2 minify from using reserved keyword gc ([a2d0adc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a2d0adcca65bb6864dc3fd8583497b3a308b4d08))


### Features

* Add Duo Workflow auto-pause feature ([a997494](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a997494806703350b502a8a4ab3733d5445c5ca3))
* add non-relative import path resolution for code suggestions ([1ba7389](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1ba738961468cca51ac43a8586a70f38a3a571f5))
* Add region field to Code Generation stream events ([e8f3936](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e8f3936bd6c585fd65f7c32735defd4897eb6c13))
* Duo Workflow - Align Buttons closer to Themes ([428b280](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/428b28066f6bec5b1eb4af809b1817c5f155f189))
* use projects tsconfig or jsconfig when resolving module imports ([5289c1c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5289c1c82286180e8e5571c4e4962c2d9b0966a5))



## [7.14.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.14.1...v7.14.2) (2025-02-18)


### Bug Fixes

* use default feature check values ([81d7b51](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/81d7b511d1c834ecc7b14a7741773022d8b43b46))



## [7.14.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.14.0...v7.14.1) (2025-02-13)


### Bug Fixes

* add @asteasolutions/zod-to-openapi to dependencies ([3b6e341](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3b6e3415db9fa977f4753d8abb5382f108990d6f))



# [7.14.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.13.0...v7.14.0) (2025-02-13)


### Features

* introduce code suggestion context availability checking ([43868f9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/43868f9d83b2fd4d0c39da35c3ac84e04aeb859d))
* introduce ImportContextProvider ([9e30ba7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9e30ba770ddc0de0163f1176b3c0ff8ea0accab0))
* run workflow via binary if docker is missing ([1beb9c5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1beb9c51fba96433f00fa85be0e298e7041cc81d))
* use new backend chat log for workflow chat ([1fd4b14](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1fd4b14a407915e38568c8e26cb37999a5f4e31f))



# [7.13.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.12.0...v7.13.0) (2025-02-10)


### Features

* add region field to Code Suggestions telemetry events ([000bc7e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/000bc7e9cc99430a30975431d6e9466041eb9558))
* Duo Workflow - Add external url warning to prompt ([e08356c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e08356c68f1c60f9dea0cfeb81fec5cd7f81df53))
* search and replace duo workflow ([bc55479](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bc5547945991bfa5fd94955b165f1a4c316beccd))



# [7.12.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.11.0...v7.12.0) (2025-02-05)


### Features

* support routable GitLab tokens ([5ba435c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5ba435cecc0dd9bf3d749f1a479ae5db7daae6cf))



# [7.11.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.10.0...v7.11.0) (2025-02-04)


### Features

* Implement openFile plugin method ([36c0fa8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/36c0fa8059ed8ac0b14d16eca44da42f3e6d6ea7))
* show MR for current branch in ai context suggestions menu ([4030a32](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4030a32e2445c0df6485d278852d67301b3dcd02))
* Update DuoWorkflow health check project copy ([6bf7eb4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6bf7eb4bd4bc7d7e3df2988398d650cf446d3bee))



# [7.10.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.9.0...v7.10.0) (2025-01-30)


### Bug Fixes

* Duo Workflow docker health checks flicker on load ([230f46d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/230f46da53707f1602ebdcfe87d4225009e17b66))
* expose security diagnostics tracking types ([d204373](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d204373235a06c8f71e7ee36bfcece76a479cf10))
* prevent virtual filesystem initialising multiple times ([402ca14](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/402ca14183cefb2e8cec7e886be497b7eea8d292))


### Features

* Forward duo-chat-v2 appReady notification to extension ([d19f64b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d19f64b6b84a6f8b589df232471cb734484dea40))
* Implement UI changes for Workflow new page ([e29ae99](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e29ae99e783df6fc495507bcb731cfac82471e70))
* improve startup performance with DuoProjectAccessCache ([8f95656](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8f9565642794b3533b3861412519e5ed12070224))



# [7.9.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.8.0...v7.9.0) (2025-01-24)


### Bug Fixes

* rendering of HTML entries in Markdown ([df1b079](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/df1b0797716a9f916f976e6832a714d6bb09e5f4))


### Features

* add polling to docker error state ([32f6e85](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/32f6e85a5c4fce3d2c688ccfe87771c46a5e5a9f))
* Duo Workflow - UI refinements for index page ([04f16e6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/04f16e681bc864dd316bf1fffc4d67fe9ed3cfbc))



# [7.8.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.7.0...v7.8.0) (2025-01-23)


### Bug Fixes

* add user-agent header to direct connection requests ([82e33a6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/82e33a6c77b47da1eeda8ae3824b9e8af430c7c6))


### Features

* Duo Workflow - Update Duo WF Finished state to Complete ([3f0fac4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3f0fac4d589675d931a955b28946f8b306c611c8))



# [7.7.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.6.1...v7.7.0) (2025-01-16)


### Bug Fixes

* Cannot run multiple workflows in parallel ([91ef4a1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/91ef4a1a4fc8f5e574daba9c84f0b8b7c4660a91))
* disable binary files in context search results ([5e70810](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5e70810e59ff65c67f7a921cf6d76540ea6bf08a))
* send information about failing CS API requests to clients ([1c59e51](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1c59e51a79fe88ec08f117bed142c68b571549b4))


### Features

* Duo Workflow - change intermediate to junior tasks ([73cbd13](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/73cbd13d245cc4fa8e76720cc23b370459756370))
* Duo Workflow - Fix Workflow chat styling issues ([f2112e9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f2112e9c18d05f4fee4451dca26d636e19a56e3d))
* fine-grained docker health checks ([dc451a9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/dc451a9ce7cb08a692a867b2a706b180b9318d8f))
* Update new workflow page with should haves ([113b93f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/113b93f5b147293f2d518b0e3a22a22d9b5cb945))



## [7.6.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.6.0...v7.6.1) (2025-01-13)



# [7.6.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.5.0...v7.6.0) (2025-01-13)


### Features

* use secondary color for tool messages ([517773a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/517773aded11837e88b917b893c6579d5adc387f))



# [7.5.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.4.0...v7.5.0) (2025-01-09)


### Bug Fixes

* don't apply code suggestions lang checks for duo chat ([d2ab717](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d2ab717baea3ea2e9570e4da9318bbdd3b1b04ec))
* get GitLab version when first validating version of configured url ([2b4caf4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2b4caf4ac1175d70e6faefe6262927a0c8652d0d))
* Prevent double initialState notifications ([f6ab84a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f6ab84aa3e07e780db4c996b78a7866a1a4f25e4))


### Features

* add docker health check ([d51ff3d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d51ff3df41aa7789f3113efb6cc710ca315695cb))
* add scan error messages ([245a09b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/245a09b8b48c2a096f5e445a0447eac43415c26a))
* apply secret redaction to all ai context items ([1fd1eba](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1fd1ebaa855ee9acb1c86a19f7768f223b1c5f74))
* Code Generation Server Sent Events ([f73bd7b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f73bd7b10a78a267e82715bf8d60e052fc194f44))
* Minimal UI for Duo Workflow ([e73640c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e73640c6356684239b9bf5edc43a9ad31120fcab))
* style prose messages different from tool ([d823b8f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d823b8fe9299ab70863c23da65d579231d293386))
* Update new workflow page with must haves ([ed0ed38](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ed0ed38cfeceba97a73bafe6d15afd59f6ee74c6))



# [7.4.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.3.0...v7.4.0) (2024-12-10)


### Bug Fixes

* correctly handle workspace changes ([2718020](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/27180201b40cb34a7ff84dda77030b2f94577e56))
* event when stopping workflow ([0dc2455](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0dc245525085318749930d3f9c7f759777d54617))
* handle connection errors from docker ([aaf9d26](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/aaf9d2641fc0b5af44631edc996309ebc99ca4c1))
* use safe operator on tool use ([9ca5fcd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9ca5fcd0e4490a559832f59987f81254c3e25ddd))


### Features

* Add `stopped` duo workflow status ([b4bedaa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b4bedaad710933776d31b459a002bf3c6a8bf69b))
* add new duo chat available features context policy ([a9b308f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a9b308f973bc7d3642e7b61f06f9c2d2e655c76a))
* fail workflow if executor exits badly ([e659044](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e65904490b1426d679ea76019dea6c11301b1392))
* update vulnerability details webview styling ([aedcaaa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/aedcaaa054d7872d32799f8c263b35adca677f8b))



# [7.3.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.2.0...v7.3.0) (2024-12-04)


### Features

* **ai-context:** LocalGitContextProvider ([77ccaba](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/77ccabad81b0a9929d5c83d2521ada8882e545df))
* create new webview for security vulnerability details ([fe7fabb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fe7fabb383868480952f4e899c39ac18fc28dba1))



# [7.2.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.1.1...v7.2.0) (2024-12-03)


### Bug Fixes

* Add Duo Workflow components theming support ([c0272e4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c0272e44354511761bd21f367d44fc107373294a))
* Fix workflow events ([407fe3d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/407fe3d55c5fddd7c1b499019bdb781f3cf7a8c1))


### Features

* Add Duo Workflow health checks ([f01f0cf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f01f0cf328a618166c4b8499479b4f12e08797d2))
* Add exception handling for Workflow controllers ([1b2800b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1b2800b692ed97f28e9b9aa03e900b7fa51f0198))
* display tool use messages instead workflow ([caaba7f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/caaba7fd2047f8960509fd2f778884b9e30690b5))
* Implement workflow stop message ([baea947](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/baea9470e37879913122e8fcf85cd77d8f2c61ab))
* Improve Workflow empty state ([56815f9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/56815f91a223d91ab1a0a341edfa39f6fccc05c5))



## [7.1.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.1.0...v7.1.1) (2024-11-26)


### Bug Fixes

* increase max number of listeners to remove EventEmitter warning ([4256313](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4256313d6b35fa8e1787876539464c41695d12be))
* Log telemetry enabled/disabled only once in CS Snowplow tracker ([30475b4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/30475b4a48ae8292879a365bd354632018c3853b))



# [7.1.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v7.0.0...v7.1.0) (2024-11-22)


### Bug Fixes

* make sure initialization errors get logged ([a383159](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a383159145f24fbf0b9984cc46d20dc48a201274))
* remove false-positive additional languages warning logs ([1f29b7d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1f29b7d7b02b300020c3542be2a5fea94067c438))
* Vue.use local error due to VueRouter ([c06f35a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c06f35ac5a7bba82c95cf2c5ea9c507794adad59))


### Features

* Add GitLab's standard context builder ([e1838ff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e1838ff03a82e5459f587622c394b856899b1e11))
* Quick chat telemetry ([dd9d117](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/dd9d117fcafa5ca3f4b6be37c15a9bd4aed90ff2))
* Show only current project workflows ([f529d98](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f529d98360091a6fa40c06316f7f63251feeaf2c))



# [7.0.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.17.0...v7.0.0) (2024-11-18)


### Code Refactoring

*  Extract `telemetryNotificationHandler` to a separate class ([c082408](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c0824086e6c77ae7fca784a455ac2a5e4aec6773))


### BREAKING CHANGES

* Instead of exporting the constant with the telemetry notification method
We now export `TelemetryNotificationType` that will check the payload of the notification
for the type safety



# [6.17.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.16.0...v6.17.0) (2024-11-17)


### Features

* add authentication required check for Chat and Code Suggestions ([3c0ebe0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3c0ebe027f38e0650d399125eca825329041dc76))
* Show workflow relative time instead of iso ([5539438](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/553943846e9afee62350efd7da10c7aedd1d9b8e))



# [6.16.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.15.0...v6.16.0) (2024-11-15)


### Features

* add custom notification for remote security scan ([329b20c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/329b20c941d9d6bd27bc31f9bc4716ee2ad085a7))
* create new custom security scan response notification ([6e03c0c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6e03c0c2fc177b3e1c6dcff7a225b0981d4f891d))
* Include all features in configuration validation response ([bcd3fd8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bcd3fd8d9ae38fff5a363fbf99d093fcb3509359))
* validate Code Suggestions for unsaved configuration ([042a68b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/042a68b497c8646d508cc64b6776e7e185e0ba75))
* **workflow:** communicate initial state to webview ([db25c44](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/db25c440d15ea7d8d8ce99f7b358b9998a391d71))



# [6.15.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.14.0...v6.15.0) (2024-11-13)


### Features

* add `issue` context provider ([5cfd460](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5cfd460eb05fae46c2469528efe4502ce04c7080))
* allow users to send messages to duo workflow ([4eccab0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4eccab0b7523c96c12c751ab1deb816dd0edc1fd))
* Include project path in Code Suggestions streaming request ([ab72dcb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ab72dcb27ebf9518367cd21b7691856a4358ee7e))
* Validate chat feature based on unsaved configuration ([d0252bb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d0252bb7eec7ce782485d04e276fa1bbbccd6664))



# [6.14.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.13.0...v6.14.0) (2024-11-12)


### Bug Fixes

* directory path handling in RepositoryService ([c1490ca](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c1490ca078974f054794a7c8e739f0cca2f1f375))
* high CPU utilization in RepositoryService ([29dbf2b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/29dbf2b44bf5208e0e06d30a9b8295d1c4da17a3))
* local logs show error details ([461c406](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/461c40661f5cf5ffd5a9ca260b862ba17a6a2483))
* Resolve "integration tests locally overrides global git config" ([178da28](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/178da2855874da6c2dfbc35dfe4b8c4f403bdb5b))
* Simplify workflow legal alert ([1a0299a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1a0299abdf17acf46c12ef20624762f2106a2e53))
* truncate MR data based on byte size instead of characters ([4d7adbf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4d7adbf1414685117860e365a114998456f82fdf))
* **workflow:** fixed the router for inner routes ([010aec6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/010aec651cf8bf0ab623592c3755251b7f165a5e))


### Features

* Add action buttons to Workflow execution panel ([a4772de](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a4772de23717c664dd77a6b36f70f7d686d64440))
* Add chat disabled by user check ([1066251](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/10662510bff23154254d4fe95193f7ffc50ef1ed))
* add instance and token info to the context ([04989e9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/04989e9a6290edf6c69c1be3ea3f6e400cee41a8))
* add merge_request context provider ([ea53391](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ea5339175f2a6a4a63d56baf3b7ff9fd5cd147e9))
* Add skeleton loader for execution section ([086acef](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/086acefdaff9bbb0b11ea78d5febc4051b9fc18f))
* add system information to panic errors ([9cd60fa](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9cd60fa41bca551e7f274589614e4c878266e703))
* add user information to error context ([400c8ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/400c8ad99b2bd1f0f9f3deba447ba62b8eacd263))
* align, dress up docker image loading message ([622e305](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/622e305ece4fc1ca25593cb1f60460446fe893dd))
* Allow specifying baseUrl and token for api requests ([9e5f179](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9e5f1798d95b589fa17b469e74afad08b2150cd1))
* Implement confirmation modal for the workflow cancel action ([2c2b2a0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2c2b2a038f67a20f62f0a4bf107ec713ff50ef8d))
* Support proxy authentication against HTTP proxies ([718b913](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/718b913a24d3d70c8cd7e518dcca6f9413f54d03))
* use duo chat components for workflow chat ([0fbf509](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0fbf5096765ab2f61bdf32439ab88f386a147c26))
* use GitLab UI for breadcrumbs for workflow ([b434adf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b434adf47e4af168d34c7ed80386069f3589cff7))
* **workflow:** handle setInitialState notification ([468a07c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/468a07c33bb3abd23a0b429b0e1b8afdfbb6799b))
* **workflow:** pick up theming from VSCode ([3482b60](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3482b6011e03ec351c77eed80b42e25afed781da))



# [6.13.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.12.0...v6.13.0) (2024-10-22)


### Bug Fixes

* Instance telemetry `suggestion_size` should not be tracked as 0 ([c6d6a3a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c6d6a3af0bba6614e6d3d42b24b1aba5e3bb93d9))
* Update workflow goal help text and placeholder ([25a5187](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/25a51874e22640d875789b475d211647e70f4a24))
* validate length of duo workflow prompt ([122f62d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/122f62dd1ca9ff18e9435c82a5b1015fd8bdf83e))


### Features

* Add code suggestions disabled by user check ([6964030](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6964030d771e4af70cde3e1129d0e5667bb46706))
* Add Duo Chat user license check ([d28c24d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d28c24d8330eaf17d9b8fb7927da3213bf1869a4))
* Move feedback form to goal section ([29da5b8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/29da5b8ef6d5f360ac311c424be97e1f163ee2fb))
* Support validate configuration authentication ([c66890d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c66890d4364f05ff14002b8bd6569c7e1263df70))
* Update Execution panel styling ([93b1dc0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/93b1dc06edfab21b5f41726944110032db82fc6d))
* Update the workflow goal panel ([8077fe4](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8077fe43a663136de37391da9fa259f665e3aed3))



# [6.12.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.11.0...v6.12.0) (2024-10-15)


### Bug Fixes

* Fix context loss when notification handler added ([f3f98dd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f3f98dd1214c00d0dc0948fd9c7200bffca441ad))


### Features

* add dependency library context provider ([c5b7d92](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c5b7d9254371a53a50146b610d6a11d752be27fa))
* update workflow status after cancel ([2123c94](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2123c943f83803f276fe01357e2d9946761fc2d8))
* Workflow details - Collapse goal section when running workflow ([0669f34](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0669f34751389eb471fe770daa611d79da3d8a05))



# [6.11.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.10.0...v6.11.0) (2024-10-11)


### Bug Fixes

* make ChatContextManager and AIContextProvider async ([af1333e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/af1333ec6a494498dd4520c2ea4cbbdbdfe50bb6))
* prevent incorrect async throttling of context providers ([22df6cb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/22df6cbf26c0affbaf6cd93e78356a58cdbcddd9))


### Features

* allow loading context item content ([c1f4f13](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c1f4f1390aa88d4ed2af6f7fa299d02481705dcd))
* cancel duo workflow by stopping container ([8922c76](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8922c769e930ccab5d9dd972f5179bfcae1b6894))
* **context:** introduced AI Context Policy ([bc2abb8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bc2abb8c303a94ffaa3e8def5dfa80135467e149))
* Duo Workflow - Update default message ([18b8916](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/18b8916b8822b1f4cb152063ce7c0c8db33ae7ac))
* **duochat:** Introduce syntax highlighting while streaming ([72557f7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/72557f764673be957316d754ed390a0172c8c07f))
* Show workflow goal on load ([68b9264](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/68b926485b6ce276594b4a58931b031065adaa31))



# [6.10.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.9.1...v6.10.0) (2024-10-03)


### Bug Fixes

* ensure feature flags exist before initVirtualFilesystem ([e79b490](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e79b490588bfb7a96121f7720cdd00afd1089383))
* subscriptions not working on new workflows ([be4454d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/be4454d8e23eabe7dad06b37e892ea6d82585229))


### Features

* Code suggestions in unsaved files ([4377378](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4377378972afc66b84eb18c045cee263c66c8cf1))



## [6.9.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.9.0...v6.9.1) (2024-10-02)


### Bug Fixes

* move tree-sitter modules to optional dependencies ([53e9dca](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/53e9dca8be7ed1a2925728b2b88520cdd33d81a9))
* workaround for config/FF race condition in repository init ([18c6d33](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/18c6d33984223291fb919c91b4af5ab375b48ee4))



# [6.9.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.8.1...v6.9.0) (2024-10-01)


### Bug Fixes

* make VirtualFileSystemService use didChangeWatchedFiles ([fe4100b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fe4100b3a476e9c552dd522a0a6ce022a28efbf0))
* Stop Workflow subscriptions when unused ([95d1be2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/95d1be21c1efda3c38c6fb48af55632f3019614d))
* support osx shortcuts ([067ce33](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/067ce339efd76f1304a0ebff66f482717e6100ff))


### Features

* add ability to check API projects for Duo access ([30db7e1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/30db7e142a1f20bd309343655a799027e95f956a))
* add utilities for parsing/making GraphQL global IDs ([efdc45e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/efdc45ed57d7713746dc90313b46560399c33a83))
* **context:** notify when finished indexing ([d64fe7c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d64fe7c5709cb964deac3cbb505a17b2f2fdfdc3))
* pass goal when creating workflow ([a981902](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a98190213363389f9b67c4b413554987e84a6050))
* pull Duo Workflow image before running ([e5b0e16](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e5b0e161372561b8561e1f2908e29183a92c1b11))
* use Workflow status instead of checkpoint ([c988838](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c9888388ddc41a1afee008025b75ac7638c9a35b))



## [6.8.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.8.0...v6.8.1) (2024-09-25)


### Bug Fixes

* add debounce to LocalFilesContextPovider ([52dbf13](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/52dbf13ea66adb04b8d5c7a7d166ee7082b78857))



# [6.8.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.7.2...v6.8.0) (2024-09-23)


### Bug Fixes

* add feature flag to VirtualFileSystemService to disable chokidar ([06f64c5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/06f64c5484b054f7716b5440c8f307d691e2c3d5))
* Duo Workflow error alert not dismissable ([bdf1356](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bdf1356a498f574801224fb7190a261358c5280d))
* Re-subscribe to workflow events when loading ([a8d39a2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a8d39a22fc49906d01e62d6cea4f34277e57d6ce))
* Update `non-gitlab-project` detection ([5df0255](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5df025570b64c9e53afc020f254b165e3d5ee21d))
* update disclaimer text ([c22163d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c22163d3e72635df1a56f251ecf38c6e7959d107))


### Features

* invoking human events for Duo workflow ([215bd7c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/215bd7ce4cef1ffb9018fe373cdc78770dd1d54d))
* Update workflow checkpoint styling ([733381e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/733381e988be2b28a2f06a4661281233887b0871))



## [6.7.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.7.1...v6.7.2) (2024-09-19)


### Other

* Revert: Re-subscribe to workflow events when loading ([b0f6844](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/commit/b0f68449f93aba6a5af31f6ac92e5a869e85ad87))



## [6.7.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.7.0...v6.7.1) (2024-09-18)


### Bug Fixes

* Re-subscribe to workflow events when loading ([4324da5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4324da55033c4acdd6db2644b4a37b185038ae7c))
* windows fs/path fix ([ea447ef](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ea447ef48bda23fe5b44bd33b6d6aa94842c9b20))



# [6.7.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.6.1...v6.7.0) (2024-09-18)


### Bug Fixes

* specify fsevent.node binary directly ([0040151](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0040151ef5dcff184360e4b2e3e66e6e4412605c))


### Features

* add disclaimer to workflow ([60ff1ef](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/60ff1efd0eade6a1e1bcb5c93e0ffc7e3b6e5f32))
* **ai-context:** Introduce the LocalFilesProvider - Injected Context ([a6e58e6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a6e58e6d3dac13cd6b5e32b7b13e2b35b34dcc15))
* auto-scroll chat window ([b0f524e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b0f524e73cc92c0ccbd09b548e62cecf04c1eacb))
* Move Duo Workflow feedback prompt to Execution section ([38abac6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/38abac657063f37b8d483f2b746957ddb6ca8a79))
* Workflow List: Show project fullpath instead of ID ([03247de](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/03247ded94f2ff43567e25376479f404d8119fe3))



## [6.6.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.6.0...v6.6.1) (2024-09-17)



# [6.6.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.5.0...v6.6.0) (2024-09-12)


### Bug Fixes

* add model name and engine to cached suggestion telemetry ([db2cf8f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/db2cf8f6e28ba31c5a205d43c32c4e3eb76da4ab))
* Empty function detection for Vue files ([f14f9dd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f14f9dd528e9242c1f0adb7651f1855efb52d81d))
* Move notifiers to `onInitialized` handler ([224c2ed](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/224c2ed48bdbfb928ee1aacafa8dd17fe4a2b7ce))
* respect duo_additional_context feature flag ([5089d6c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5089d6ca2f26a56065d5e4bb3b74e2d6d2387d2b))


### Features

* Add Duo Workflows page ([c7f82a9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c7f82a9c7cd47fddfd4417e2248e57bc8a1962e4))
* **ai-context:** implement open tabs as provider ([a805c2d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a805c2da93682b6fe702cbb5f1ebecae63147f0c))
* pass git arguments to workflow executor ([8be67fb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8be67fb1d90cd11a6091df0a8f034e209cbd5841))



# [6.5.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.4.0...v6.5.0) (2024-09-10)


### Bug Fixes

* log the expected direct connection failures as info ([ce517ae](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ce517aec36034cefb73a9374c82d01f3c8cb871a))


### Features

* Add Code suggestions license check ([94b3b9f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/94b3b9f07717646eb242ab3082a8f0fd32973d37))
* Add Minimal GitLab instance version check for Code Suggestions ([bc9ccdf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bc9ccdf12525d6b9675073b3de989b3ae963f5fc))
* adjust default duo workflow goal ([2b896d5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2b896d563672b73615547eedcf67e26d1d237493))
* **ai-context:** Added getProviderCategories() to the manager ([00e2913](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/00e2913f183a15b1f4c4e9c2679536f4417df003))
* show chat messages from duo workflow ([c712c64](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c712c642c40f876beb9039393fb57c3b5190f709))



# [6.4.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.3.0...v6.4.0) (2024-09-04)


### Bug Fixes

* Initialise notifiers only when connection is initialised ([97f385b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/97f385b82803e3c163b41ffb92d0a5be93092710))


### Features

* added AI Context Management ([a33e44e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a33e44eb23aeebc99cf3059ac52519b20471e826))
* Detect "language" for telemetry event ([f5a24ce](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f5a24ce3f22b04a06b9994bb9dccbb57362efd25))
* show executing duo workflow steps ([75c3c59](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/75c3c59a972de2f0e97dbb359af334780ca3c3ee))
* subscribe to do workflow events ([9e7bd53](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9e7bd5379e0bae31847c066faf13be622c0fcaf8))



# [6.3.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.2.0...v6.3.0) (2024-08-28)


### Features

* **security:** Post-process schema URLs in code suggestions ([d323d32](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d323d32d1a19f72f0d1da31f84f2a4c480b3ab69))



# [6.2.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.1.0...v6.2.0) (2024-08-27)

We renamed some notification types that temporarily break VS Code Extension build but otherwise aren't breaking changes [refactor: persistent streaming handler](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/698)

### Features

* Detect intent "generation" in empty functions in Python ([d590006](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d590006940cd94c4be80c5b536b84ddf9cb8c836))



# [6.1.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v6.0.0...v6.1.0) (2024-08-22)


### Bug Fixes

* Apply default sort on workflow checkpoints returned by GQL API ([31ddd94](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/31ddd9428198ab0e87c01749c574311771023026))
* Check supported language only on `setDocumentActive` event ([e37c506](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e37c506edd2099300e5f718d86e70aac44e37984))


### Features

* add link to duo workflow feedback form ([43519ed](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/43519eda98ef462561a7a312f94b77c3eb1a1069))
* add Duo disabled for project check([ec8061c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/commit/ec8061c8b59ce940dab91bb09bf06792ff45bd80))


# [6.0.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v5.0.0...v6.0.0) (2024-08-20)


### Bug Fixes

* only notify on actual changes to LanguagesService ([aeceee3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/aeceee3fb2cc23e3423ff40e964614715dfca7b6))


### Features

* add new state notification for disabled language ([04db755](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/04db75521ac7017d358e5c6def04c0804e3eadf3))
* Duo Workflow fetch workflow token ([3ee23f9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3ee23f9b0f5bee5c3ba39961c3df3cef103a837d))
* initial port of duo chat from vscode ([f9ce04e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f9ce04e288196fc1cfceda7017b95d68240482f5))
* normalize invalid "additionalLanguages" identifiers ([3e327ea](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3e327ead55ef61611ab4d8e8460f07f88ad51bcd))
* reduce suggestion debounce from 300ms to 250ms ([bd098b3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bd098b39fc8a50a72d60a976295627cb8b308d90))


### BREAKING CHANGES

* This adds a new possible value to the
`$/gitlab/featureStateChange` notification's first parameter:
`code-suggestions-document-disabled-language`.

Addresses
https://gitlab.com/gitlab-org/gitlab-vscode-extension/-/issues/1430.



# [5.0.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.25.0...v5.0.0) (2024-08-16)


### BREAKING CHANGES

* We introduced Generic Features State Management ([4ecb109](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/commit/4ecb109dfb5998431698a9b315c677bfe0543abb)) and removed support for the separate Code Suggestion State Management. This change resulted in modifications to the communication protocol between the Server and Client.
  * Removed `$/gitlab/codeSuggestions/stateChange` notification in favor of `$/gitlab/featureStateChange` [notification](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/commit/4ecb109dfb5998431698a9b315c677bfe0543abb#6ddb0927a7a5641a4efb2ac4eb3a88ebf735ee4a_6_6).
  * The format of the payload sent in the notification is changed from [string value](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/commit/4ecb109dfb5998431698a9b315c677bfe0543abb#6ddb0927a7a5641a4efb2ac4eb3a88ebf735ee4a_8_8) containing the identificator of the engaged check to the [array of objects]( https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/commit/4ecb109dfb5998431698a9b315c677bfe0543abb#6ddb0927a7a5641a4efb2ac4eb3a88ebf735ee4a_9_8) of the [`FeatureState` type](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/commit/4ecb109dfb5998431698a9b315c677bfe0543abb#fd4ec37d4ecf1896c30e94088faeabfc25141235_0_22) each representing separate feature state.
    * For clients importing the `CodeSuggestionsLSState` type, the `CODE_SUGGESTION_STATE_CHANGE` constant, and the `CodeSuggestionAvailabilityStateChange` constant, these entities are no longer available.

# [4.25.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.24.0...v4.25.0) (2024-08-16)


### Bug Fixes

* send language server header for direct connection requests ([6d8a09e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6d8a09e9f546d2e703b55beaecf05343c743b280))


### Features

* Setup duo workflow graphql service with polling ([7381a2e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7381a2ee5c7dd57faf45a4786ebab5ed66872fe9))



# [4.24.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.23.2...v4.24.0) (2024-08-14)


### Features

* Add Workflow goal and execution component ([3cb5d60](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3cb5d60f3f39e9d686f11f2dede37437747e6284))
* switching between open tabs adds them to advanced context cache ([c00320a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c00320a623eac03c6b97dc61d1c32fa6f3c916da))



## [4.23.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.23.1...v4.23.2) (2024-08-09)

* No functional changes, exposes additional arguments to language server ([!633](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/merge_requests/633))


## [4.23.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.23.0...v4.23.1) (2024-08-08)


### Bug Fixes

* include static webview assets in npm package ([b23797e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b23797e759072133f18831fab48fccb54f6f9a6f))



# [4.23.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.22.0...v4.23.0) (2024-08-08)


### Bug Fixes

* intent detection within a block comment is now "completion" ([2b83e91](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2b83e9198918c8bc2616768ede9b3af5dc57fca1))


### Features

* add get webview info request handler ([682888a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/682888a0c53fc69d35520b1c371294befe980734))
* Add more  Tree Sitter parsers and queries ([2d34ae1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2d34ae1665fbe265e2bef225c0291b098dd6eaae))
* Detect intent 'generation' for empty functions in Ruby ([50acd75](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/50acd75640b086db88ed8ecf56539ba98ae69954))
* **workflow:** added Duo Workflow webview ([5ef08cf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5ef08cf17bd1a1a720eab198f5708d744bb047d7))



# [4.22.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.21.1...v4.22.0) (2024-08-05)


### Bug Fixes

* reintroduce notifications export ([c839445](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c8394452ed5346b045b01e67584f97617eca8708))
* revert !592 ([34af686](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/34af6861c0557e69046c3800f754facd2b4215a1))
* send completion intent when cursor is on an empty comment ([32ef6ab](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/32ef6ab5119e7c5d9232a2d8fe9e21c1f48a19e8))


### Features

* add documents to advanced context when switching tabs ([7893f5f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7893f5f9740d337296cf802c2d7259de7ff6b9e6))
* Add tree sitter parsers ([1befe4d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1befe4d64490dc074bf5dc19abd3a2df8d91e4ac))
* call the create workflow API ([ba3dd60](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ba3dd600af85ad699ef942b18626e55ee54373e2))
* Track `gitlab_instance_version` in Snowplow telemetry ([5ac3029](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5ac3029e311e3f4547521b1d0b2b168753e0792c))



## [4.21.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.21.0...v4.21.1) (2024-07-26)

- fixing package.json dependencies definitions that were blocking upgrading LS in VS Code Extension

# [4.21.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.20.1...v4.21.0) (2024-07-26)


### Bug Fixes

* Cache `additionalContexts` to improve telemetry ([28de354](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/28de35407db690f3753019c61603564ab184116c))


### Features

* allow server to specify model provider/name for direct connect ([1f3912b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/1f3912bd9f372add1f79b322a4bc270540e0255f))



## [4.20.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.20.0...v4.20.1) (2024-07-16)


### Bug Fixes

* graphql-request should inherit fetch options ([2a2928c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2a2928c64e7263b92a79bc34618e356c91a4a44f))



# [4.20.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.19.0...v4.20.0) (2024-07-12)


### Bug Fixes

* **advanced-context:** adjust-byte-size-limit ([b706d0e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b706d0e9851dd536c9f9c2f42b6db6fde2efbd17))


### Features

* Detect intent 'generation' for empty functions ([5eac811](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5eac8119fb2e022f4c293d7bbf2f93fee66d5abf))
* Send CS telemetry to GitLab instance ([67a8567](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/67a85676b336a63339e8cdf3dc235effde60ad17))



# [4.19.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.18.1...v4.19.0) (2024-07-10)


### Features

* adding the ability to start a workflow ([a881b5f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a881b5f40b9f0cd7f0e83443321423501af5dee3))
* create shared package for webview application utils ([2db367e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2db367e68653450b9e5d6419df1183b863221316))



## [4.18.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.18.0...v4.18.1) (2024-07-09)


### Bug Fixes

* include language in telemetry for cached suggestions ([b5d5188](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b5d518863a1e8380a9bfa0ef5ee5f88de019cf48))



# [4.18.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.17.0...v4.18.0) (2024-07-08)


### Features

* **advancedcontext:** open tabs context editor setting ([802d007](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/802d007b1c5bb2f8e0d9f69ab7f27da18944a290))
* support disabling of languages ([77a4164](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/77a41643274aa2c974254c186846185d88533a6e))
* Track language server version in bundle ([0234506](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0234506247bface338623b655f85651c3a5b8c76))



# [4.17.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.16.0...v4.17.0) (2024-07-03)


### Bug Fixes

* Fix reporting telemetry events registered by the client ([efda0f2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/efda0f2887f999fead601c6bac11c5f16411cfb8))


### Features

* intent detection for small files ([042eaa8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/042eaa875e92472b69f94cb55a6f0d7f5e9c3e9c))



# [4.16.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.15.0...v4.16.0) (2024-06-27)


### Bug Fixes

* pin web-tree-sitter to 0.20.8 for now ([0ccb5df](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0ccb5df1c14459ec6438178fb5546c2375852b0c))
* registering static resources + graceful shutdown with socket.io ([69a1d95](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/69a1d95066cd6b937c17bf2fac5ae6c70dc134b4))


### Features

* Advanced cool down for direct connection suggestion requests ([5de4d18](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5de4d18bafc42e0d9db2cecb12f09be10798f41f))
* swap MRU cache for LRU cache and add size limit ([a534b28](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a534b286557b9c5988e811a5d5f489e6e6393e36))



# [4.15.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.14.0...v4.15.0) (2024-06-25)


### Bug Fixes

* Disable telemetry logging when telemetry is OFF ([77481b8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/77481b8341427efb5ade11c826db0261cfddaa1e))
* user_instruction should be sent in code suggestions request ([91c755b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/91c755bb50bc4a97ac07297fab6c5ba07e731ebb))


### Features

* include useful stacktraces with all errors ([a8517cd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a8517cdf8dcde4f9938e088d5a0fcd5fada7debf))
* use HTTP keep-alive for direct connections ([f2d4a86](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f2d4a86695b2a75f2f6833d96345b9417735d94e))



# [4.14.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.13.2...v4.14.0) (2024-06-17)


### Features

* enable telemetry for tracking direct connection ([835af87](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/835af87feea79b8ea31ff9ae132ec846e4985fcf))
* setup webview http endpoints ([5d5ddc0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5d5ddc077adc8d63f273ea03cb7d2add70cf1d16))



## [4.13.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.13.1...v4.13.2) (2024-06-13)


### Bug Fixes

* correct instance FF ([3d812c2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/3d812c2a753baddbb672136420eeee28cb56d5a9))



## [4.13.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.13.0...v4.13.1) (2024-06-13)

* introduces [IDE: Call Cloud Connector directly instead of going through the monolith first](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/issues/183) behind `gitlab.featureFlags.codeSuggestionsClientDirectToGateway` feature flag

# [4.13.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.12.0...v4.13.0) (2024-06-12)


### Bug Fixes

* windows DuoProjectAccessCache for open file tabs ([c9796e5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c9796e52c87e32108287d185f7b1fc84bbef4002))


### Features

* introduce 15s default timeout for requests ([8acd932](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8acd932e3bb2282195d9e1991062cd905393f0cd))
* setup webview transports ([741007a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/741007ada75570071054786bfe6ee3804d568713))



# [4.12.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.11.0...v4.12.0) (2024-06-07)


### Features

* Add telemetry for advanced context usage ([67f90ab](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/67f90abe2f44ddb52e94898f2edb79a94cfc62e1))



# [4.11.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.10.0...v4.11.0) (2024-06-06)


### Features

* Add an Intel-based MacOS binary distribution ([62c22c8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/62c22c88f65a73945abfa4ae24cc05b8dc300579))
* Add fastify HTTP server ([e20698c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e20698c226449a97656c3f5111c3d37e3d7b826b))
* add webview plugin abstraction package ([542fec2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/542fec288cb0e7d5abc90cdffb7faee69bbe1841))
* open file tabs advanced context resolver ([aca258a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/aca258a58dcf97995999c967b3d4c3cdc96ac67b))
* open file tabs api call ([6cb31d6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6cb31d6f9969f85b7c1094ee487c8dbded2c4cb2))
* open file tabs file resolvers ([020746e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/020746e23bfe21fd77a623eaf80c3a3d16647969))
* open file tabs gitlab remote parser ([c0ff53b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c0ff53b88d1bf5e594edea408017346a713401e2))
* open file tabs mru cache ([23b531e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/23b531e9c2d0ec8d7f025a9e4104c74ba82b876d))



# [4.10.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.9.0...v4.10.0) (2024-05-28)


### Bug Fixes

* override default config array values with client config ([c554a31](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c554a314886812dca14db97e89bae5f5f569b67a))


### Features

* Telemetry for multiple code suggestions ([54b7b3b](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/54b7b3bab9384cb0178a9e555ec62b076760f0a5))



# [4.9.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.8.1...v4.9.0) (2024-05-23)


### Features

* cycle through suggestions ([e83513f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e83513f789b01d308bd04ddb65991d43961bb1f2))



## [4.8.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.8.0...v4.8.1) (2024-05-21)



# [4.8.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.7.0...v4.8.0) (2024-05-21)


### Bug Fixes

* only set intent when generation is detected ([65987e2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/65987e2c46dfa261bc8cf81a713ea316c6be59ba))


### Features

* Add additional attributes to code suggestions telemetry ([2853f70](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2853f708812eafe6e646cf7630656087ce6014a1))
* better comment detection ([990b08c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/990b08c83140f2ada640e314b6ba133791186136))



# [4.7.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.6.0...v4.7.0) (2024-05-13)


### Bug Fixes

* Handle malformed user language setting for CS ([c849aa7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c849aa7995676a59f6db382c58e6faf644b39bd9))



# [4.6.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.5.0...v4.6.0) (2024-05-09)


### Bug Fixes

* allow http proxy options for streaming calls ([1356152](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/135615216c3ae2edf0a738e1d7129920fd4e60ee))
* initialize proxy before first token check ([89a6ddb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/89a6ddb56cd32d1a45d6ba953f1acdcbb50b4611))


### Features

* Allow to expand the list of languages for Code Suggestions ([476b1de](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/476b1debfa9d4c2c80167a94cbbdbf7dbf8e8f37))



# [4.5.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.4.1...v4.5.0) (2024-05-06)



## [4.4.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.4.0...v4.4.1) (2024-04-16)

### Features

* Add status code to streamed suggestions telemetry ERROR events ([b5c0196](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b5c0196918356798e2e497728f09cbad0e0352cb))

### Bug Fixes

* Track streamed suggestion `language` ([d6ce9ea](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d6ce9ea01634e51597f3ba2cfb7f0fd25fc39ba6))



# [4.4.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.2.2...v4.4.0) (2024-04-12)

NOT RELEASED

# [4.3.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.2.2...v4.3.0) (2024-03-20)


### Features

* Enable streaming of code generation for Java files ([0e26db6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0e26db6e2c93668fb516ed0f4e6db619236f2bc4))
* Streaming telemetry ([9919259](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9919259352a7720347f51f6572774798b89cc162))
* Update the code suggestions context to v2.6.0 ([7819cac](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7819cac7e53b379e8672d1f0414dcd78db88a148))



## [4.2.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.2.1...v4.2.2) (2024-03-04)


### Bug Fixes

* improve streaming error logging ([c6bf219](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c6bf2195adef27da49cdd8d5b3a358b36bc0dcea))



## [4.2.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.2.0...v4.2.1) (2024-03-01)


### Bug Fixes

* Remove stacktrace from logs omitting an error object ([2b23022](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/2b2302280341de906d8210308df7a122c37ca3ec))



# [4.2.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.1.0...v4.2.0) (2024-03-01)


### Features

* improve HTTP error reporting ([fee28f3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fee28f3f8e47d40888deb71d2f5983b1cded701f))



# [4.1.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v4.0.0...v4.1.0) (2024-02-29)


### Features

* Support configuration of http agent certificate options ([f1a37f9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f1a37f9ce3b0a114f1619325e1c812375327c7f7))



# [4.0.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.33.0...v4.0.0) (2024-02-07)


### chore

* remove support for deprecated code suggestion endpoints ([a23a164](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a23a16495e19a9010e2a3bb905d6f77382297f5e))


### Features

* Add circuit breaking to streaming ([8123e20](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/8123e2037e1f5ea01a22d86b3b49fc4b5ae11eae))


### BREAKING CHANGES

* Previously we used a different api endpoint
for the code suggestions whereas configured instance version
was lower than 16.3. That endpoint will soon become unavailable
and the code suggestion will be supported only for the versions >= 16.8.0



# [3.33.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.32.0...v3.33.0) (2024-01-25)



# [3.32.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.31.0...v3.32.0) (2024-01-16)


### Bug Fixes

* Support ignoring certificate errors ([59400e8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/59400e83afcff80d57aff7fa32ae42effdcabb0d))



# [3.31.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.30.0...v3.31.0) (2024-01-11)


### Features

* Move streaming decision to the LS ([bd7ec64](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bd7ec646f88ee386d5ab118c78d35b124ffa56e5))



# [3.30.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.29.1...v3.30.0) (2024-01-09)


### Bug Fixes

* Improve generation intent detection ([11ee891](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/11ee8917534c0599d540457ac48d44c4b84fc5b4))



## [3.29.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.29.0...v3.29.1) (2024-01-05)



# [3.29.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.28.0...v3.29.0) (2023-12-21)


### Features

* Support Web IDE and VSCode browser environments ([42a5ee9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/42a5ee9e8aaaf553bcdbf5de81a98ba4c242627e))



# [3.28.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.27.1...v3.28.0) (2023-12-20)


### Features

* streaming debouncing ([4d74e18](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4d74e18ae168d28d7eea012af9127739d15536d2))



## [3.27.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.27.0...v3.27.1) (2023-12-19)


### Bug Fixes

* Catch async errors in streaming handler ([c04a228](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c04a228702d92b12eed99c59ce92edfd26016f6f))


### Features

* Detect completion intent ([9727729](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/972772963ce2c6510e32b8e3f25b259a401d95e6))
* improve completion for neovim ([84b8376](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/84b83768dc500f8b10ac2a2ced482f97d3896e8f))



# [3.27.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.26.0...v3.27.0) (2023-12-19)


### Bug Fixes

* Abstract away platform specific parser initialization ([d2b36a1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d2b36a190e7b3c3b01096c84c17fb8f89afd75bf))


### Features

* **code_suggestions:** Added streaming to code suggestions ([04771d6](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/04771d6611c76ba71f28f43a87eacde8378ed1fc))



# [3.26.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.25.0...v3.26.0) (2023-12-18)



# [3.25.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.24.2...v3.25.0) (2023-12-18)


### Bug Fixes

* Fix misplaced anchor ([cd9eaff](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/cd9eaffb860a02c359ab28c502c87aaea21efecb))
* Promote dayjs to dependency from dev dependencies ([beb7188](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/beb718833a40731253ac8e7c89af57e36e330913))


### Features

* **tree-sitter:** Assume suggestion intent based on completion context ([82317eb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/82317eb2f8f714f73c054cee05f415de6e72ae34))



## [3.24.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.24.1...v3.24.2) (2023-12-14)

### Bug fixes

* Reverts [d411ae7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d411ae7c3c04273427a73750520ee0e0950b8855) as it caused a cache issue. ([c1c9d7e](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/c1c9d7e5eef40cb2b3bf0c76fa4dc0b10c0a58d3))

## [3.24.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.24.0...v3.24.1) (2023-12-13)


### Bug Fixes

* Send abort signal to api ([d411ae7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/d411ae7c3c04273427a73750520ee0e0950b8855))



# [3.24.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.23.0...v3.24.0) (2023-12-12)


### Features

* Include project path in code suggestion requests ([b3be3e2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b3be3e29216cfcf3e485897c72a8d7d96f0b9267))



# [3.23.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.22.0...v3.23.0) (2023-12-12)


### Features

* Do not request suggestion with completion context text mismatch ([4ba34cd](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/4ba34cd07951117d08aa27711beadadb7ec232f4))



# [3.22.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.21.0...v3.22.0) (2023-12-08)


### Features

* **cache:** discard cache entries upon second retrieval ([ed8d2d7](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ed8d2d74c9cd676a4ab93beb48d540081d7500c6))
* Enable the Code Suggestions cache be default ([af8795a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/af8795a73242682660c30410d8be342096823422))
* Support execution through npx ([6fbe9f8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/6fbe9f8c7f97663c5a11599a1007f852fb34d3ec))



# [3.21.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.20.1...v3.21.0) (2023-12-08)


### Bug Fixes

* improve token check logging behavior ([7dd7d5d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7dd7d5d79ad237b6f58225f3d6e66d5d0b851da7))


### Features

* add telemetry for cache hits ([e15443c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e15443c231edaa7e521b617373230c38fba870f5))
* add timestamped and formatted logger ([de06343](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/de063432f51ba9d9221262541d361bf61df66ac4))
* assume token type by length heuristic during token check ([b679202](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b6792021765be3d8533fec5d7a54cc4a16d24b15))
* debug log all http fetches ([bfe5a9c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/bfe5a9c6e2dc7b40e84779f8364601fe1b256f20))
* make log levels filterable ([fc424fc](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/fc424fc409033e09cbbe5ee6770c78d71ffe1e99))



## [3.20.2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.20.1...v3.20.2) (2023-12-06)


### Bug Fixes

* improve token check logging behavior ([7dd7d5d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7dd7d5d79ad237b6f58225f3d6e66d5d0b851da7))


### Features

* assume token type by length heuristic during token check ([b679202](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/b6792021765be3d8533fec5d7a54cc4a16d24b15))



## [3.20.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.19.0...v3.20.1) (2023-12-06)

### Bug Fixes

- support non `glpat-` prefixed tokens ([aa37dc3](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/aa37dc33ed03a39eedc3ce86639b390923e124a9))

### Features

- Use completion context in code suggestions ([0ce196a](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/0ce196ada688b012c38467b276ceae38a91e87e4))

# [3.20.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.19.0...v3.20.0) (2023-12-04)

### Features

- add cache configuration ([63c4679](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/63c46794a8cf7fa6fa96527a53d4e76d133b6522))
- add caching of code suggestions response ([a84428c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a84428cbbdac54773867f4a196738d908cdedb80))

# [3.19.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.18.1...v3.19.0) (2023-12-03)

### Bug Fixes

- Revert Reject inline completions with intellisense ([614d895](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/614d895fb0c4ecf589812759d32467802d079b10))

## [3.18.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.18.0...v3.18.1) (2023-12-01)

### Bug Fixes

- the LS only needs api scope, read_user is redundant ([ea4a9ee](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/ea4a9ee71afedebd527ce4f9d3c7f573d5f3e042))

# [3.18.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.17.0...v3.18.0) (2023-11-30)

### Features

- Reject inline completions with intellisense context ([7726054](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/7726054f9831001b9d090c3bb055953a59bb3b3c))

# [3.17.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.16.1...v3.17.0) (2023-11-29)

### Bug Fixes

- inline completion items missing range ([259b2c8](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/259b2c895ff12a756404e1dcf677ab4f92bcafc5))

### Features

- add debouncing and cancellation to LS ([93a33c5](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/93a33c5903fb0de10a59e3ef1392da00cf32f112))
- **telemetry:** only autoreject if client sends accepted events ([9e0d8cf](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/9e0d8cf0aa911afd95a0399f8e2498af251c5ba6))

## [3.16.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.16.0...v3.16.1) (2023-11-24)

- Exports check token notification type for the VS Code Extension

# [3.16.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.15.0...v3.16.0) (2023-11-24)

### Bug Fixes

- Fix browser build ([f9f65d9](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f9f65d9ab2231faa3d94b47641c3cddb8dca1ec1))
- remove hello notification ([015304d](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/015304db38bc85944889f73dee68fbe3899a7551))

### Features

- Add Circuit Breaker ([f933c55](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/f933c55adf9fe8946ffbc1a4e35b8378ef053825))
- Notify Clients about API error/recovery ([34027eb](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/34027ebe6b98489554503f252aa452e84095ea2f))
- remove unnecessary console log ([83f16be](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/83f16bea76d3cf4ae91979616405d7dd12a29c58))
- **telemetry:** Implement "suggestion rejected" logic ([5d7815f](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/5d7815f752e705b7cc12ca77b99aedaa8a0b8d3f))

# [3.15.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.14.0...v3.15.0) (2023-11-13)

### Bug Fixes

- Restore missing ajv dependency ([208a6ad](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/208a6ad24b38deb30a6a3d1f91491e99d241bcc7))

### Features

- Handle empty suggestion text on the LS side ([e1162f2](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/e1162f2f6cdd11422de7359ef7eeaf983dd849e7))

# [3.14.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.13.0...v3.14.0) (2023-11-10)

### Features

- add accept suggestion command ([a2b3e7c](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/commit/a2b3e7c2ab7919fb5a1977c06fea2b1210c761cf))

# [3.13.0](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.12.1...v3.13.0) (2023-11-09)

- Swap a node dependency that would prevent web contexts from using the bundle (!94)

## [3.12.1](https://gitlab.com/gitlab-org/editor-extensions/gitlab-language-server-for-code-suggestions/compare/v3.12.0...v3.12.1) (2023-11-06)

- No functional changes, only testing the new release process (!81)

## v3.12.0

- Allow clients to track `suggestion_not_provided` (!83)

## v3.11.0

- Track `language_server_version` with telemetry events (!78)

## v3.10.0

- Support `textDocument/inlineCompletion` message (!75)

## v3.9.0

- Only provide suggestions when cursor is at or near end of a line. (!61)
- Validate Snowplow events against the schema before tracking (!55)

## v3.8.0

- Fix issue where partial config updates used wrong values (!65) (also refactors LS configuration)

## v3.7.0

- Support using an HTTP proxy for connections (!35)
- Fix duplicated Snowplow events (!67)

## v3.6.0

- Bundle whole LS into one JS file to be used in VS Code (!62)

## v3.5.0

- Update Snowplow event `code_suggestions_context` schema to v2-1-0 (!64)
- Make Secret redaction respect the config setting, also enable it in the browser build (!57)

## v3.4.0

- Handle better error response from the Code Suggestions server (!56)

## v3.3.0

- Don't make suggestions for short content (!30)
- asdf `.tool-versions` file added for nodejs v18.16.0 (!47)

## v3.2.0

- Send all console messages to STDERR (!45)
- Disable snowplow events when host cannot be resolved (!45)
- Update `code_suggestions_context` schema to `v2-0-1` (!43)

## v3.1.0

- Add `suggestion_not_provided` telemetry event when suggestions are returned empty (!38)
- Allow Client to detect the `suggestion_shown` event (!38)

## v3.0.0

- Use custom `ide` and `extension` initialization parameters for telemetry (!32)

## v2.2.1

- Rely on `model.lang` value in the response from Code Suggestions server to set `language` property for the Code Suggestions telemetry context (!34)

## v2.2.0

- Enable Code Suggestions telemetry by default (!41)

## v2.1.0

- Send the relative file path to the Code suggestions server (!29)
- Update `appId` for Snowplow tracking (!36)

## v2.0.0

- Add Snowplow tracking library (!25)
- Add Code Suggestions telemetry (!27)
- Move all Client settings handling to the `DidChangeConfiguration` notification handler (!27)

## v1.0.0

- Update `token/check` notification to `$/gitlab/token/check` (!17)
- Document required and optional messages for server & client (!17)
- Document initialize capabilities (!17)
- Check that `completion` is supported by the client (!17)

## v0.0.8

- Bumping version to keep packages in sync (!22)

## v0.0.7

- Revert `re2` usage as it was causing issues with some platforms (!20)

## v0.0.6

- Fix npm package publishing
- Refactor TS build to accommodate WebWorker LSP

## v0.0.5

- Start publishing an npm package

## v0.0.4

- Add new code suggestions endpoint (!12)
- Add token check (!13)
- Subscribe to document sync events and publish diagnostics (empty for now) (!15)
- Use `re2` to work with Gitleaks regex (!16)

## v0.0.3

- Documenting server startup configuration and capabilities (!8)
- Bug fix for the code suggestions (!8)

## v0.0.2

- Easier build and publish (!10)
- Refactor for browser entrypoint (!6)
- Add secrets redaction (!7)

## v0.0.1

- Base version
