import type { TreeSitterLanguageName } from '../languages';

const bashEmptyFunctionQuery = `(
  (function_definition
    body: (compound_statement) @empty_body)
  (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
)` as const;

const cEmptyFunctionQuery = `(
  (function_definition
    body: (compound_statement) @empty_body)
  (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
)` as const;

const cppEmptyFunctionQuery = `(
  [
    (function_definition
      body: (compound_statement) @empty_body)
    (lambda_expression
       body: (compound_statement) @empty_body)
    (class_specifier
       body: (field_declaration_list ) @empty_body)
  ]
  (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
)` as const;

const csharpEmptyFunctionQuery = `(
  [
    (class_declaration
      body: (declaration_list) @empty_body)
    (constructor_declaration
      body: (block) @empty_body)
    (method_declaration
       body: (block) @empty_body)
    (lambda_expression
       body: (block) @empty_body)
  ]
  (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
)` as const;

const typescriptEmptyFunctionQuery = `((
  [
    (function_declaration
      body: (statement_block) @empty_body)
    (arrow_function
      body: (statement_block) @empty_body)
    (function_expression
      body: (statement_block) @empty_body)
    (class_declaration
      body: (class_body) @empty_body)
    (method_definition
      body: (statement_block) @empty_body)
    (generator_function_declaration
      body: (statement_block) @empty_body)
  ] (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
))` as const;

const javascriptEmptyFunctionQuery = `((
  [
    (function_declaration
      body: (statement_block) @empty_body)
    (arrow_function
      body: (statement_block) @empty_body)
    (function_expression
      body: (statement_block) @empty_body)
    (class_declaration
      body: (class_body) @empty_body)
    (method_definition
      body: (statement_block) @empty_body)
    (generator_function_declaration
      body: (statement_block) @empty_body)
  ] (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
))` as const;

const javaEmptyFunctionQuery = `(
  [
    (method_declaration
      body: (block) @empty_body)
    (lambda_expression
      body: (block) @empty_body)
    (class_declaration
      body: (class_body) @empty_body)
    (constructor_declaration
      body: (constructor_body) @empty_body)
  ] (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
)` as const;

const goEmptyFunctionQuery = `(
  [
    (method_declaration
      body: (block) @empty_body)
    (function_declaration
      body: (block) @empty_body)
    (func_literal
      body: (block) @empty_body)
  ] (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
)`;
// TODO: need special handling - no body similar to ruby and python
/* class_method_definition
class_statement
function_statement */
const powershellEmptyFunctionQuery = `` as const;

const scalaEmptyFunctionQuery = `(
  [
    (function_definition
      body: (block) @empty_body)
    (class_definition
      body: (template_body) @empty_body)
    (lambda_expression
      (block) @empty_body)
  ] (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
)` as const;

const tsxEmptyFunctionQuery = `((
  [
    (function_declaration
      body: (statement_block) @empty_body)
    (arrow_function
      body: (statement_block) @empty_body)
    (function_expression
      body: (statement_block) @empty_body)
    (class_declaration
      body: (class_body) @empty_body)
    (method_definition
      body: (statement_block) @empty_body)
    (generator_function_declaration
      body: (statement_block) @empty_body)
  ] (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
))` as const;

const kotlinEmptyFunctionQuery = `([
      (function_declaration
        (function_body) @empty_body)
      (class_declaration
        (class_body) @empty_body)
      ((lambda_literal) @empty_body)
      ((secondary_constructor) @empty_body)
  ] (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
  )`;

const rustEmptyFunctionQuery = `([
    (function_item
      body: (block) @empty_body)
    (impl_item
      body: (declaration_list) @empty_body)
    (closure_expression
      body: (block) @empty_body)
    (macro_definition
      (macro_rule
        right: (token_tree) @empty_body))
    (token_tree) @empty_body
] (#match? @empty_body "^\\\\s*\\\\{\\\\s*\\\\}\\\\s*$")
)`;

const rubyEmptyFunctionQuery = `(
[
  (method
    !body)
 (class
 	!body)
 (block
    !body
 )
] @empty_function
)`;

// captures only functions that contains only "pass_statement" or "ellipses"
const pythonEmptyFunctionQuery = `(
  [
  (function_definition
    body: (block
      . (pass_statement)
    ))
  (class_definition
    body: (block
      . (pass_statement)
    ))
   (function_definition
    body: (block
      . (expression_statement
      . (ellipsis))
    ))
  (class_definition
    body: (block
      . (expression_statement
      . (ellipsis))
    ))
  ]
) @empty_function`;

// TODO: the languages below need special handling
// and are not currently supported for empty function detection
const vueEmptyFunctionQuery = ``;

export const emptyFunctionQueries = {
  bash: bashEmptyFunctionQuery,
  c: cEmptyFunctionQuery,
  cpp: cppEmptyFunctionQuery,
  c_sharp: csharpEmptyFunctionQuery,
  css: '',
  go: goEmptyFunctionQuery,
  java: javaEmptyFunctionQuery,
  powershell: powershellEmptyFunctionQuery,
  python: pythonEmptyFunctionQuery,
  scala: scalaEmptyFunctionQuery,
  typescript: typescriptEmptyFunctionQuery,
  tsx: tsxEmptyFunctionQuery,
  javascript: javascriptEmptyFunctionQuery,
  kotlin: kotlinEmptyFunctionQuery,
  rust: rustEmptyFunctionQuery,
  ruby: rubyEmptyFunctionQuery,
  vue: vueEmptyFunctionQuery,
  // the following languages do not have functions, so queries are empty
  yaml: '',
  html: '',
  json: '',
} satisfies Record<TreeSitterLanguageName, string>;
