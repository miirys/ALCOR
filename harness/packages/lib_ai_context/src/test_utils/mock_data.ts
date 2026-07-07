import { URI } from 'vscode-uri';
import { createFakePartial } from '@gitlab-org/test-utils';
import { IDocContext } from '@gitlab-org/document';
import type {
  DependencyAIContextItem,
  GitContextItem,
  ImportAIContextItem,
  IssueAIContextItem,
  LocalFileAIContextItem,
  MergeRequestAIContextItem,
  OpenTabAIContextItem,
} from '../context_providers';

export const OPEN_TAB_FILE: OpenTabAIContextItem = {
  id: 'foo-bar-js',
  category: 'file',
  content: '',
  metadata: {
    enabled: true,
    subType: 'open_tab',
    relativePath: '/path/to/foo-bar.js',
    title: 'Foo Bar',
    icon: 'document',
    secondaryText: '/path/to/foo-bar.js',
    subTypeLabel: 'Project file',
    languageId: 'javascript',
    byteSize: 100,
    lastAccessed: Date.now(),
    lastModified: Date.now(),
  },
};

export const ANOTHER_OPEN_TAB_FILE: OpenTabAIContextItem = {
  id: 'baz-qux-js',
  category: 'file',
  content: '',
  metadata: {
    enabled: true,
    subType: 'open_tab',
    relativePath: '/path/to/baz-qux.js',
    title: 'Baz Qux',
    icon: 'document',
    secondaryText: '/path/to/baz-qux.js',
    subTypeLabel: 'Project file',
    languageId: 'javascript',
    byteSize: 100,
    lastAccessed: Date.now(),
    lastModified: Date.now(),
  },
};

export const IMPORT_FILE: ImportAIContextItem = {
  id: '/path/to/imported-foo-bar.js',
  category: 'file',
  content: '',
  metadata: {
    title: 'Imported Foo Bar',
    enabled: true,
    subType: 'import',
    icon: 'document',
    secondaryText: '/path/to/imported-foo-bar.js',
    subTypeLabel: 'Project file',
    languageId: 'javascript',
    project: 'some/project',
    resolvedImportPath: createFakePartial<URI>({}),
    sourceDocumentContext: createFakePartial<IDocContext>({}),
    importPath: '/path/to/imported-foo-bar.js',
    languageName: 'javascript',
    importIdentifiers: [],
  },
};

export const FILE_LOCAL_SEARCH_ITEM: LocalFileAIContextItem = {
  id: 'wow-ding-js',
  category: 'file',
  content: '',
  metadata: {
    enabled: true,
    subType: 'local_file_search',
    relativePath: '/path/to/wow-ding.js',
    title: 'Wow Ding',
    project: 'wow/ding/project',
    icon: 'document',
    secondaryText: 'wow/ding/project - /path/to/wow-ding.js',
    subTypeLabel: 'Project file',
  },
};

export const INVALID_SUBTYPE_ITEM: OpenTabAIContextItem = {
  id: 'invalid-subtype',
  category: 'file',
  content: '',
  metadata: {
    enabled: true,
    title: 'Invalid Subtype',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subType: 'invalid:subtype' as any,
    icon: 'document',
    secondaryText: '',
    subTypeLabel: '',
    languageId: 'javascript',
    byteSize: 100,
    lastAccessed: Date.now(),
    lastModified: Date.now(),
  },
};

export const NO_SUBTYPE_ITEM: OpenTabAIContextItem = {
  id: 'invalid-subtype',
  category: 'file',
  content: '',
  metadata: {
    enabled: true,
    title: 'No Subtype',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    subType: '' as any,
    icon: 'document',
    secondaryText: '',
    subTypeLabel: '',
    languageId: 'javascript',
    byteSize: 100,
    lastAccessed: Date.now(),
    lastModified: Date.now(),
  },
};

export const INVALID_CATEGORY_ITEM: OpenTabAIContextItem = {
  id: 'foo-bar',
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  category: 'invalid' as any,
  content: '',
  metadata: {
    enabled: true,
    subType: 'open_tab',
    subTypeLabel: 'Project file',
    relativePath: '/path/to/foo-bar.js',
    title: 'Foo Bar',
    secondaryText: '/path/to/foo-bar.js',
    icon: 'document',
    languageId: 'javascript',
    byteSize: 100,
    lastAccessed: Date.now(),
    lastModified: Date.now(),
  },
};

export const DISABLED_OPEN_TAB_FILE: OpenTabAIContextItem = {
  id: 'disabled-open-tab-file',
  category: 'file',
  content: '',
  metadata: {
    enabled: false,
    subType: 'open_tab',
    subTypeLabel: 'Project file',
    relativePath: '/path/to/disabled-open-tab-file.js',
    title: 'Disabled Open Tab File',
    secondaryText: '/path/to/disabled-open-tab-file.js',
    icon: 'document',
    languageId: 'javascript',
    byteSize: 100,
    lastAccessed: Date.now(),
    lastModified: Date.now(),
  },
};

export const DEPENDENCY_ITEM: DependencyAIContextItem = {
  id: 'dependency-item',
  category: 'dependency',
  metadata: {
    enabled: true,
    subType: 'dependency',
    subTypeLabel: 'Project dependencies',
    title: 'Dependency Item',
    icon: 'package',
    secondaryText: 'package.json',
    libs: [
      { name: 'lodash', version: '4.17.21' },
      { name: 'react', version: '17.0.2' },
    ],
  },
};

export const ISSUE_ITEM: IssueAIContextItem = {
  id: 'gid://gitlab/Issue/1234',
  category: 'issue',
  metadata: {
    enabled: true,
    subType: 'issue',
    subTypeLabel: 'Issue',
    title: 'Issue Item',
    icon: 'issues',
    secondaryText: '#1',
    webUrl: 'https://example.com/issues/1',
  },
};

export const MERGE_REQUEST_ITEM: MergeRequestAIContextItem = {
  id: 'gid://gitlab/MergeRequest/1234',
  category: 'merge_request',
  content: '',
  metadata: {
    enabled: true,
    subType: 'merge_request',
    subTypeLabel: 'Merge request',
    icon: 'merge-request',
    secondaryText: '!1234',
    title: 'test(AdvancedContext): mock merge request',
    webUrl: 'https://example.com/foo/bar/-/merge_request/1234',
  },
};

export const GIT_CONTEXT_ITEM: GitContextItem = {
  id: 'diff:file:///workspace/project:main',
  category: 'local_git',
  metadata: {
    title: 'Diff from main',
    enabled: true,
    subType: 'local_git',
    repositoryUri: 'file:///workspace/project',
    repositoryName: 'group/project',
    workspaceFolder: {
      uri: 'file:///workspace',
      name: 'workspace',
    },
    selectedBranch: 'main',
    gitType: 'diff',
    icon: 'git',
    secondaryText: 'Compare Changes with main',
    subTypeLabel: 'Diff',
    disabledReasons: [],
  },
};
