import { join } from 'node:path';
import {
  COMMON_TREE_SITTER_LANGUAGES,
  type TreeSitterLanguageInfo,
} from '@gitlab-org/legacy-common';
import { getAssetsRootPath } from '../assets_manager';

export const TREE_SITTER_LANGUAGES = COMMON_TREE_SITTER_LANGUAGES.map((definition) => ({
  ...definition,
  wasmPath: join(getAssetsRootPath(), definition.wasmPath),
})) satisfies TreeSitterLanguageInfo[];
