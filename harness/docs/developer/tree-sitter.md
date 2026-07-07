# Tree Sitter

The long-term goal is to use [GitLab Code Parser](https://gitlab.com/gitlab-org/rust/gitlab-code-parser) to power our grammar-based logic.

## Building and updating grammars

To improve developer experience (speed up the `bun install`), grammars have been moved to a separate `vendor/tree-sitter-packages` subproject.

```shell
cd vendor/tree-sitter-packages
bun install
bun run build
```

This will:

1. Compile the WASM files using the tree-sitter CLI
1. Output them directly to `vendor/grammars/`
1. Generate a manifest file at `vendor/grammars/manifest.json`

The `tree-sitter-packages` subproject isolates the slow compilation process from the main project's `bun install`, significantly reducing development setup time.

## Adding New Languages

To add support for a new language:

For resource-intensive grammars (>30 seconds compilation time), add them to the `vendor/tree-sitter-packages` subproject:

1. Add the package to `vendor/tree-sitter-packages/package.json` in `optionalDependencies`
1. Add the grammar definition to `vendor/tree-sitter-packages/scripts/build-grammars.js` in the `GRAMMARS` array
1. Update `src/common/tree_sitter/languages.ts` to include the language in `COMMON_TREE_SITTER_LANGUAGES`
1. Build the grammar using `cd vendor/tree-sitter-packages && bun run build`

## Tree Sitter Queries

Using [tree-sitter queries](https://tree-sitter.github.io/tree-sitter/syntax-highlighting#queries), written in a lisp-like syntax, we’re able to extract structured information from a documents syntax tree.

We use tree-sitter queries to capture various AST nodes for different needs. For example, we use queries to capture comments in a file, or to identify function definitions.

For example, to capture comments in a file:

```lisp
  (line_comment)
  (multiline_comment)
] @comment @spell

((multiline_comment) @comment.documentation
  (#lua-match? @comment.documentation "^/[*][*][^*].*[*]/$"))

```

To identify function definitions:

```lisp
(call
  function: [
      (identifier) @name
      (attribute
        object: (identifier) @parent
        attribute: (identifier) @name)
  ]
  arguments: (argument_list) @codeium.parameters) @reference.call

```

Depending on the type of information you want to extract, you'll need to create a new query file or update an existing one.

Depending on the type of information you want to extract, you'll need to create a new query file or update an existing one.

Query files are located in `src/common/parser/(your-resolver)/(resolver)_queries` and are named according to the type of information they extract, for example `comment_queries.ts` for comment queries. Each query file exports an object that maps language names to query strings.

When adding a new query, make sure to:

1. Create a new query file or update an existing one in `src/common/parser/queries`.
1. Test your query thoroughly using the [tree-sitter playground](https://tree-sitter.github.io/tree-sitter/playground).
1. Write unit tests/integration tests to ensure your query works as expected.
1. Update the relevant _resolver_ (e.g. `CommentResolver`) to use your new query.
1. Confirm `bun run compile` succeeds.
1. Confirm `bun run test:unit` succeeds.
1. Open an MR and confirm the integration test job passes.
