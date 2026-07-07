import { gql } from 'graphql-request';
import {
  AiCatalogFlowItem,
  AiCatalogItemID,
  FallbackEvent,
  GraphQLOperation,
} from '../../../types';

export type UpdateCatalogFlowVariables = {
  id: AiCatalogItemID;
  definition: string;
};

export type UpdateCatalogFlowData = {
  aiCatalogFlowUpdate: {
    item: AiCatalogFlowItem | null;
    errors: string[];
  };
};

export const UpdateCatalogFlowMutation: GraphQLOperation<UpdateCatalogFlowData> = {
  supportedSinceInstanceVersion: '18.8.0',
  query: gql`
    mutation lsp_updateCatalogFlow($id: AiCatalogItemID!, $definition: String!) {
      aiCatalogFlowUpdate(input: { id: $id, definition: $definition }) {
        item {
          id
          name
          description
          public
          updatedAt
          project {
            id
            fullPath
          }
          latestVersion {
            ... on AiCatalogFlowVersion {
              id
              versionName
              humanVersionName
              released
              releasedAt
              updatedAt
            }
          }
        }
        errors
      }
    }
  `,
  fallback: (event: FallbackEvent): UpdateCatalogFlowData => {
    if (event.err) {
      throw new Error(`Error updating catalog flow: ${event.err}`, {
        cause: event.err,
      });
    }

    throw new Error('Catalog flow update requires GitLab 18.8 or later');
  },
};
