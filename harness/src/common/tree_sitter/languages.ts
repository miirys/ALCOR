export type TreeSitterLanguageName =
  | 'bash'
  | 'c'
  | 'cpp'
  | 'c_sharp'
  | 'css'
  | 'go'
  | 'html'
  | 'java'
  | 'javascript'
  | 'json'
  | 'kotlin'
  | 'powershell'
  | 'python'
  | 'ruby'
  | 'rust'
  | 'scala'
  | 'typescript'
  | 'tsx'
  | 'vue'
  | 'json'
  | 'yaml';

export interface TreeSitterLanguageInfo {
  /** Grammar name */
  name: TreeSitterLanguageName;

  /** Associated extensions */
  extensions: string[];

  editorLanguageIds: string[];

  /**
   * The expected location of the WASM binary. Each target platform (node,
   * browser) should transform this value as needed. The values provided here
   * are relative to the root of the repository.
   */
  wasmPath: string;

  /**
   * The location of where the tree-sitter CLI will build the WASM file.
   * See "build_tree_sitter_wasm.ts" script.
   */
  nodeModulesPath?: string;
}

/*!
 * The GitLab Language Server (@gitlab-org/gitlab-lsp) project includes the following binary distributions of tree-sitter grammars:
 *
 * tree-sitter-go.wasm:
 *   Copyright (c) 2014 Max Brunsfeld
 *   Licensed under The MIT License (MIT) - https://github.com/tree-sitter/tree-sitter-go/blob/master/LICENSE
 * tree-sitter-java.wasm:
 *   Copyright (c) 2017 Ayman Nadeem
 *   Licensed under The MIT License (MIT) - https://github.com/tree-sitter/tree-sitter-java/blob/master/LICENSE
 * tree-sitter-javascript.wasm:
 *   Copyright (c) 2014 Max Brunsfeld
 *   Licensed under The MIT License (MIT) - https://github.com/tree-sitter/tree-sitter-javascript/blob/master/LICENSE
 * tree-sitter-python.wasm:
 *   Copyright (c) 2016 Max Brunsfeld
 *   Licensed under The MIT License (MIT) - https://github.com/tree-sitter/tree-sitter-python/blob/master/LICENSE
 * tree-sitter-ruby.wasm:
 *   Copyright (c) 2016 Rob Rix
 *   Licensed under The MIT License (MIT) - https://github.com/tree-sitter/tree-sitter-ruby/blob/master/LICENSE
 * tree-sitter-typescript:
 *   Copyright (c) 2017 GitHub
 *   Licensed under The MIT License (MIT) - https://github.com/tree-sitter/tree-sitter-typescript/blob/master/LICENSE
 * tree-sitter-kotlin.wasm:
 *   Copyright (c) 2019 fwcd
 *   Licensed under The MIT License (MIT) - https://github.com/fwcd/tree-sitter-kotlin/blob/master/LICENSE
 * tree-sitter-rust.wasm:
 *   Copyright (c) 2019 fwcd
 *   Licensed under The MIT License (MIT) - https://github.com/hydro-project/rust-sitter/blob/master/LICENSE
 * tree-sitter-vue.wasm:
 *   Copyright (c)  2019 Ika
 *   Licensed under The MIT License (MIT) -https://github.com/tree-sitter-grammars/tree-sitter-vue/blob/fork/LICENSE
 * tree-sitter-yaml.wasm:
 *   Copyright (c) 2019 Ika
 *   Licensed under The MIT License (MIT) - https://github.com/ikatyang/tree-sitter-yaml/blob/master/LICENSE
 */
export const COMMON_TREE_SITTER_LANGUAGES = [
  {
    name: 'c',
    extensions: ['.c'],
    wasmPath: 'vendor/grammars/tree-sitter-c.wasm',
    nodeModulesPath: 'tree-sitter-c',
    editorLanguageIds: ['c'],
  },
  {
    name: 'cpp',
    extensions: ['.cpp'],
    wasmPath: 'vendor/grammars/tree-sitter-cpp.wasm',
    nodeModulesPath: 'tree-sitter-cpp',
    editorLanguageIds: ['cpp'],
  },
  {
    name: 'c_sharp',
    extensions: ['.cs'],
    wasmPath: 'vendor/grammars/tree-sitter-c_sharp.wasm',
    nodeModulesPath: 'tree-sitter-c-sharp',
    editorLanguageIds: ['csharp'],
  },
  {
    name: 'css',
    extensions: ['.css'],
    wasmPath: 'vendor/grammars/tree-sitter-css.wasm',
    nodeModulesPath: 'tree-sitter-css',
    editorLanguageIds: ['css'],
  },
  {
    name: 'go',
    extensions: ['.go'],
    wasmPath: 'vendor/grammars/tree-sitter-go.wasm',
    nodeModulesPath: 'tree-sitter-go',
    editorLanguageIds: ['go'],
  },
  {
    name: 'java',
    extensions: ['.java'],
    wasmPath: 'vendor/grammars/tree-sitter-java.wasm',
    nodeModulesPath: 'tree-sitter-java',
    editorLanguageIds: ['java'],
  },
  {
    name: 'javascript',
    extensions: ['.js'],
    wasmPath: 'vendor/grammars/tree-sitter-javascript.wasm',
    nodeModulesPath: 'tree-sitter-javascript',
    editorLanguageIds: ['javascript'],
  },
  {
    name: 'python',
    extensions: ['.py'],
    wasmPath: 'vendor/grammars/tree-sitter-python.wasm',
    nodeModulesPath: 'tree-sitter-python',
    editorLanguageIds: ['python'],
  },
  {
    name: 'ruby',
    extensions: ['.rb'],
    wasmPath: 'vendor/grammars/tree-sitter-ruby.wasm',
    nodeModulesPath: 'tree-sitter-ruby',
    editorLanguageIds: ['ruby'],
  },
  {
    name: 'scala',
    extensions: ['.scala'],
    wasmPath: 'vendor/grammars/tree-sitter-scala.wasm',
    nodeModulesPath: 'tree-sitter-scala',
    editorLanguageIds: ['scala'],
  },
  {
    name: 'typescript',
    extensions: ['.ts'],
    wasmPath: 'vendor/grammars/tree-sitter-typescript.wasm',
    nodeModulesPath: 'tree-sitter-typescript/typescript',
    editorLanguageIds: ['typescript'],
  },
  {
    name: 'tsx',
    extensions: ['.tsx', '.jsx'],
    wasmPath: 'vendor/grammars/tree-sitter-tsx.wasm',
    nodeModulesPath: 'tree-sitter-typescript/tsx',
    editorLanguageIds: ['typescriptreact', 'javascriptreact'],
  },
  // FIXME: parsing the file throws an error, address separately, same as sql
  // {
  //   name: 'hcl', // terraform, terragrunt
  //   extensions: ['.tf', '.hcl'],
  //   wasmPath: 'vendor/grammars/tree-sitter-hcl.wasm',
  //   nodeModulesPath: 'tree-sitter-hcl',
  //   editorLanguageIds: [],
  // },
  {
    name: 'kotlin',
    extensions: ['.kt'],
    wasmPath: 'vendor/grammars/tree-sitter-kotlin.wasm',
    nodeModulesPath: 'tree-sitter-kotlin',
    editorLanguageIds: ['kotlin'],
  },
  {
    name: 'powershell',
    extensions: ['.ps1'],
    wasmPath: 'vendor/grammars/tree-sitter-powershell.wasm',
    nodeModulesPath: 'tree-sitter-powershell',
    editorLanguageIds: ['powershell'],
  },
  {
    name: 'rust',
    extensions: ['.rs'],
    wasmPath: 'vendor/grammars/tree-sitter-rust.wasm',
    nodeModulesPath: 'tree-sitter-rust',
    editorLanguageIds: ['rust'],
  },
  {
    name: 'yaml',
    extensions: ['.yaml', '.yml'],
    wasmPath: 'vendor/grammars/tree-sitter-yaml.wasm',
    nodeModulesPath: '@tree-sitter-grammars/tree-sitter-yaml',
    editorLanguageIds: ['yaml'],
  },
  {
    name: 'html',
    extensions: ['.html'],
    wasmPath: 'vendor/grammars/tree-sitter-html.wasm',
    nodeModulesPath: 'tree-sitter-html',
    editorLanguageIds: ['html'],
  },
  // FIXME: parsing the file throws an error, address separately, same as hcl
  // {
  //   name: 'sql',
  //   extensions: ['.sql'],
  //   wasmPath: 'vendor/grammars/tree-sitter-sql.wasm',
  //   nodeModulesPath: '@derekstride/tree-sitter-sql',
  // editorLanguageIds: ['sql'],
  // },
  {
    name: 'bash',
    extensions: ['.sh', '.bash', '.bashrc', '.bash_profile'],
    wasmPath: 'vendor/grammars/tree-sitter-bash.wasm',
    nodeModulesPath: 'tree-sitter-bash',
    editorLanguageIds: ['shellscript'],
  },
  {
    name: 'json',
    extensions: ['.json'],
    wasmPath: 'vendor/grammars/tree-sitter-json.wasm',
    nodeModulesPath: 'tree-sitter-json',
    editorLanguageIds: ['json'],
  },
] satisfies TreeSitterLanguageInfo[];
