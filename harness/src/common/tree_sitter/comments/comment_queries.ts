import type { TreeSitterLanguageName } from '../languages';

const cCommentQuery = `(comment) @comment` as const;

const cppCommentQuery = `(comment) @comment` as const;

const csharpCommentQuery = `(comment) @comment` as const;

const cssCommentQuery = `(comment) @comment` as const;

// const sqlCommentQuery = `(comment) @comment` as const;

const bashCommentQuery = `(comment) @comment` as const;

const jsonCommentQuery = `(comment) @comment` as const;

const goCommentQuery = `(comment) @comment` as const;

// const hclCommentQuery = `(comment) @comment` as const;

const powershellCommentQuery = `(comment) @comment` as const;

const javaCommentQuery = `[
  (line_comment)
  (block_comment)
] @comment` as const;

const javascriptCommentQuery = `(comment) @comment` as const;

const kotlinCommentQuery = `[
  (line_comment)
  (multiline_comment)
] @comment` as const;

const pythonCommentQuery = `(comment) @comment @spell
(expression_statement
  (string) @comment.documentation @spell
  (#match? @comment.documentation "^(\\"\\"\\"|\\'\\'\\')"))
` as const;

const rubyCommentQuery = '(comment) @comment' as const;

const rustCommentQuery = `[
  (line_comment)
  (block_comment)
] @comment` as const;

const scalaCommentQuery = `[
  (comment)
  (block_comment)
] @comment` as const;

const typescriptCommentQuery = `(comment) @comment` as const;

const vueCommentQuery = `
(comment) @comment @spell
((comment) @comment.documentation
  (#lua-match? @comment.documentation "^/\\[\\*\\]\\[\\*\\][^\\*].*\\[\\*\\]/$"))
` as const;

const yamlCommentQuery = '(comment) @comment' as const;

const htmlCommentQuery = '(comment) @comment' as const;

export const commentQueries = {
  bash: bashCommentQuery,
  c: cCommentQuery,
  cpp: cppCommentQuery,
  c_sharp: csharpCommentQuery,
  css: cssCommentQuery,
  go: goCommentQuery,
  // hcl: hclCommentQuery,
  html: htmlCommentQuery,
  java: javaCommentQuery,
  javascript: javascriptCommentQuery,
  json: jsonCommentQuery,
  kotlin: kotlinCommentQuery,
  powershell: powershellCommentQuery,
  python: pythonCommentQuery,
  rust: rustCommentQuery,
  ruby: rubyCommentQuery,
  scala: scalaCommentQuery,
  // sql: sqlCommentQuery,
  typescript: typescriptCommentQuery,
  tsx: typescriptCommentQuery,
  vue: vueCommentQuery,
  yaml: yamlCommentQuery,
} satisfies Record<TreeSitterLanguageName, string>;
