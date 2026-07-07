import {
  type AIContextItem,
  AIContextCategory,
  AIContextPolicyResponse,
  DuoChatAIRequest,
} from '@gitlab-org/ai-context';

export { AIContextProvider } from '@gitlab-org/ai-context';

export interface AIContextPolicyProvider {
  isContextItemAllowed: (relativePath: string) => Promise<AIContextPolicyResponse>;
}

export const AIContextEndpoints = {
  QUERY: '$/gitlab/ai-context/query',
  ADD: '$/gitlab/ai-context/add',
  REMOVE: '$/gitlab/ai-context/remove',
  CURRENT_ITEMS: '$/gitlab/ai-context/current-items',
  RETRIEVE: '$/gitlab/ai-context/retrieve',
  GET_PROVIDER_CATEGORIES: '$/gitlab/ai-context/get-provider-categories',
  CLEAR: '$/gitlab/ai-context/clear',
  GET_ITEM_CONTENT: '$/gitlab/ai-context/get-item-content',
} as const;

export type AIContextEndpointTypes = {
  [AIContextEndpoints.QUERY]: {
    request: DuoChatAIRequest;
    response: AIContextItem[];
  };
  [AIContextEndpoints.ADD]: {
    request: AIContextItem;
    response: boolean;
  };
  [AIContextEndpoints.REMOVE]: {
    request: AIContextItem;
    response: boolean;
  };
  [AIContextEndpoints.CURRENT_ITEMS]: {
    request: undefined;
    response: AIContextItem[];
  };
  [AIContextEndpoints.RETRIEVE]: {
    request: undefined;
    response: AIContextItem[];
  };
  [AIContextEndpoints.GET_PROVIDER_CATEGORIES]: {
    request: undefined;
    response: AIContextCategory[];
  };
  [AIContextEndpoints.CLEAR]: {
    request: undefined;
    response: boolean;
  };
  [AIContextEndpoints.GET_ITEM_CONTENT]: {
    request: AIContextItem;
    response: AIContextItem;
  };
};
export type GitDiffRequest = {
  /**
   * The URI of the repository to get the diff for
   */
  repositoryUri: string;
  /**
   * The branch to get the diff for
   * This will compare the current changes to the branch
   */
  branch: string;
};

export const AiContextEditorRequests = {
  GIT_DIFF: '$/gitlab/ai-context/git-diff',
  GIT_COMMIT_CONTENTS: '$/gitlab/ai-context/git-commit-contents',
  EDITOR_SELECTION: '$/gitlab/ai-context/editor-selection',
} as const;
export type EditorRequestEndpointTypes = {
  [AiContextEditorRequests.GIT_DIFF]: {
    request: GitDiffRequest;
    response: string;
  };
};
