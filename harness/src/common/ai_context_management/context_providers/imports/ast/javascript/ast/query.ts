import type { ImportIdentifier, ImportMetadata } from '@gitlab-org/ai-context';
import { ValueOf } from '../../utils';

const importIdentifierTypes = {
  importedIdentifier: 'imported-identifier',
  renamedIdentifier: 'renamed-identifier',
  defaultImport: 'default-import',
  namespaceImport: 'namespace-import',
  requireName: 'require-name',
  dynamicImportName: 'dynamic-import-name',
} as const;

const importPathTypes = {
  importSource: 'import-source',
  requireSource: 'require-source',
  dynamicImportSource: 'dynamic-import-source',
} as const;

export const captureMap = {
  ...importIdentifierTypes,
  func: '_func',
  ...importPathTypes,
} as const;

export type ImportIdentifierType = ValueOf<typeof importIdentifierTypes>;
export type ImportPathType = ValueOf<typeof importPathTypes>;

export const treeSitterQuery = `(
  [
    ; 1. Named imports (with optional alias)
    (import_statement
      (import_clause
        (named_imports
          (import_specifier
            name: (identifier) @${captureMap.importedIdentifier}
            alias: (identifier)? @${captureMap.renamedIdentifier}
          )
        )
      )
      source: (string) @${captureMap.importSource}
    )

    ; 2. Default import
    (import_statement
      (import_clause (identifier) @${captureMap.defaultImport})
      source: (string) @${captureMap.importSource}
    )

    ; 3. Namespace import
    (import_statement
      (import_clause
        (namespace_import (identifier) @${captureMap.namespaceImport})
      )
      source: (string) @${captureMap.importSource}
    )

    ; 4. Side-effect import (no import clause)
    (import_statement
      source: (string) @${captureMap.importSource}
    )

    ; 5. Require in variable declarations (including destructuring)
    (variable_declarator
      name: [
        ; Simple identifier
        (identifier) @${captureMap.requireName}
        ; Object destructuring pattern
        (object_pattern 
          [
            (shorthand_property_identifier_pattern) @${captureMap.requireName}
            (pair_pattern
              key: (property_identifier)
              value: (identifier) @${captureMap.requireName})
          ]
        )
      ]
      value: (call_expression
        function: (identifier) @${captureMap.func}
        arguments: (arguments (string) @${captureMap.requireSource})
      )
      (#eq? @${captureMap.func} "require")
    )

    ; 6. Standalone require
    (call_expression
      function: (identifier) @${captureMap.func}
      arguments: (arguments (string) @${captureMap.requireSource})
      (#eq? @${captureMap.func} "require")
    )

    ; 6. Dynamic imports - simple case
    (variable_declarator
      name: [
        (identifier) @${captureMap.dynamicImportName}
        (object_pattern
          [
            (shorthand_property_identifier_pattern) @${captureMap.dynamicImportName}
            (pair_pattern
              key: (property_identifier)
              value: (identifier) @${captureMap.dynamicImportName})
          ]
        )
      ]
      value: [
        (call_expression
          function: (import)
          arguments: (arguments (string) @${captureMap.dynamicImportSource})
        )
        (await_expression
          (call_expression
            function: (import)
            arguments: (arguments (string) @${captureMap.dynamicImportSource})
          ))
      ]
    )

    ; 7. Dynamic imports with destructuring
    (variable_declarator
      name: (object_pattern
        (shorthand_property_identifier_pattern) @${captureMap.dynamicImportName}
      )
      value: (call_expression
        function: (import)
        arguments: (arguments (string) @${captureMap.dynamicImportSource})
      )
    )

    ; 8. Await dynamic imports
    (variable_declarator
      name: (identifier) @${captureMap.dynamicImportName}
      value: (await_expression
        (call_expression
          function: (member_expression
            object: (call_expression
              function: (import)
              arguments: (arguments (string) @${captureMap.dynamicImportSource})
            )
          )
        )
      )
    )
  ]
)
`;

export type ESImportMetadata = ImportMetadata<ImportPathType, ImportIdentifierType>;
export type ESImportIdentifier = ImportIdentifier<ImportPathType, ImportIdentifierType>;
