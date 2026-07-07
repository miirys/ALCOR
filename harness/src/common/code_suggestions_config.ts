// See the docs/developer/supported_languages.md for more information.

export interface SupportedLanguageEntry {
  languageId: string;
  humanReadableName: string;
  fileExtensions: string[];
}

export const supportedLanguages: SupportedLanguageEntry[] = [
  {
    languageId: 'c',
    humanReadableName: 'C',
    fileExtensions: ['.c'],
  },
  {
    languageId: 'cpp',
    humanReadableName: 'C++',
    fileExtensions: ['.cpp', '.cc', '.cxx', '.c++', '.h', '.hpp', '.hxx', '.h++'],
  },
  {
    languageId: 'csharp',
    humanReadableName: 'C#',
    fileExtensions: ['.cs'],
  },
  {
    languageId: 'go',
    humanReadableName: 'Go',
    fileExtensions: ['.go'],
  },
  {
    languageId: 'haml',
    humanReadableName: 'HAML',
    fileExtensions: ['.haml'],
  },
  {
    languageId: 'handlebars',
    humanReadableName: 'Handlebars',
    fileExtensions: ['.hbs', '.handlebars'],
  },
  {
    languageId: 'java',
    humanReadableName: 'Java',
    fileExtensions: ['.java'],
  },
  {
    languageId: 'javascript',
    humanReadableName: 'JavaScript',
    fileExtensions: ['.js'],
  },
  {
    languageId: 'javascriptreact',
    humanReadableName: 'JavaScript React',
    fileExtensions: ['.jsx'],
  },
  {
    languageId: 'kotlin',
    humanReadableName: 'Kotlin',
    fileExtensions: ['.kt', '.kts'],
  },
  {
    languageId: 'python',
    humanReadableName: 'Python',
    fileExtensions: ['.py'],
  },
  {
    languageId: 'php',
    humanReadableName: 'PHP',
    fileExtensions: ['.php'],
  },
  {
    languageId: 'ruby',
    humanReadableName: 'Ruby',
    fileExtensions: ['.rb'],
  },
  {
    languageId: 'rust',
    humanReadableName: 'Rust',
    fileExtensions: ['.rs'],
  },
  {
    languageId: 'scala',
    humanReadableName: 'Scala',
    fileExtensions: ['.scala'],
  },
  {
    languageId: 'shellscript',
    humanReadableName: 'Shell',
    fileExtensions: ['.sh'],
  },
  {
    languageId: 'sql',
    humanReadableName: 'SQL',
    fileExtensions: ['.sql'],
  },
  {
    languageId: 'swift',
    humanReadableName: 'Swift',
    fileExtensions: ['.swift'],
  },
  {
    languageId: 'typescript',
    humanReadableName: 'TypeScript',
    fileExtensions: ['.ts'],
  },
  {
    languageId: 'typescriptreact',
    humanReadableName: 'TypeScript React',
    fileExtensions: ['.tsx'],
  },
  {
    languageId: 'svelte',
    humanReadableName: 'Svelte',
    fileExtensions: ['.svelte'],
  },
  {
    languageId: 'terraform',
    humanReadableName: 'Terraform',
    fileExtensions: ['.tf', '.tfvars'],
  },
  {
    languageId: 'terragrunt',
    humanReadableName: 'Terragrunt',
    fileExtensions: ['.hcl'],
  },
  {
    languageId: 'vue',
    humanReadableName: 'Vue',
    fileExtensions: ['.vue'],
  },
];
