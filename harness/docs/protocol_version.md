# LSP version

The current Language Server primarily supports version `3.17` of the LSP protocol, with selective support for some version `3.18` features like inline code completion.

If you're migrating from the Go version of the Language server (which was based
on LSP version `3.16`) no protocol changes that require a client update happened
between these versions.

## Supported LSP Versions

- Core support: LSP `3.17`
- Extended features: Selected features from LSP `3.18` (specifically `textDocument/inlineCompletion`)

## Related topics

- [LSP 3.17 changelog](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/#version_3_17_0)
- [LSP 3.18 changelog](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.18/specification/)
