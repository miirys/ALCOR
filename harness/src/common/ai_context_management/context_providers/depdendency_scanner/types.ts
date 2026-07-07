import { URI } from 'vscode-uri';
import { DependencyLibrary } from '@gitlab-org/ai-context';

export type { DependencyLibrary } from '@gitlab-org/ai-context';

export type DependencyType = {
  lang: string;
  type: string;
  fileName: string;
  subDirs?: boolean;
};

export type ParsedDependency = {
  type: DependencyType;
  fileUri: URI;
  libs: DependencyLibrary[];
};

export const DEPENDENCY_TYPES: DependencyType[] = [
  { lang: 'ruby', type: 'ruby', fileName: 'Gemfile.lock' },
  { lang: 'javascript', type: 'javascript', fileName: 'package.json' },
  { lang: 'go', type: 'go', fileName: 'go.mod' },
  { lang: 'python', type: 'poetry', fileName: 'pyproject.toml' },
  { lang: 'python', type: 'pip', fileName: 'requirements.txt', subDirs: true },
  { lang: 'python', type: 'conda', fileName: 'environment.yml' },
  { lang: 'php', type: 'php', fileName: 'composer.json' },
  { lang: 'java', type: 'maven', fileName: 'pom.xml' },
  { lang: 'java', type: 'gradle', fileName: 'build.gradle' },
  { lang: 'kotlin', type: 'gradle', fileName: 'build.gradle.kts' },
  { lang: 'csharp', type: 'csharp', fileName: '^.*\\.csharp', subDirs: true },
  { lang: 'cpp', type: 'conantxt', fileName: 'conanfile.txt' },
  { lang: 'cpp', type: 'conanpy', fileName: 'conanfile.py' },
  { lang: 'cpp', type: 'vcpkg', fileName: 'vcpkg.json' },
];
