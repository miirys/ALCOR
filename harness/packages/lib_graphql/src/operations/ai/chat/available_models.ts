import { gql } from 'graphql-request';
import { AvailableModels, FallbackEvent, GraphQLOperation, GroupID } from '../../../types';
import { Metadata } from '../../../types/metadata';

export type AiChatAvailableModelsVariables = {
  rootNamespaceId?: GroupID;
};

export type AiChatAvailableModelsData = {
  aiChatAvailableModels: AvailableModels | null;
  metadata: Metadata | null;
};

/**
 * Available chat models for Duo Agent Platform including GitLab default and pinned model selection.
 */
export const AiChatAvailableModelsQuery: GraphQLOperation<AiChatAvailableModelsData> = {
  supportedSinceInstanceVersion: '18.5.0',
  query: gql`
    query lsp_aiChatAvailableModels($rootNamespaceId: GroupID!) {
      metadata {
        featureFlags(names: ["ai_user_model_switching"]) {
          enabled
          name
        }
        version
      }

      aiChatAvailableModels(rootNamespaceId: $rootNamespaceId) @gl_introduced(version: "18.4.0") {
        defaultModel {
          ...modelFields
        }
        selectableModels {
          ...modelFields
        }
        pinnedModel @gl_introduced(version: "18.5.0") {
          ...modelFields
        }
      }
    }

    fragment modelFields on AiModelSelectionOfferedModel {
      name
      ref
    }
  `,
  fallback: (event: FallbackEvent): AiChatAvailableModelsData => {
    if (event.err) {
      throw new Error(`Error querying available models: ${event.err}`, {
        cause: event.err,
      });
    }

    return {
      aiChatAvailableModels: null,
      metadata: null,
    };
  },
};
