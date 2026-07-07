import { gql } from 'graphql-request';
import {
  AiCatalogFlowItem,
  AiCatalogItemID,
  FallbackEvent,
  GraphQLOperation,
} from '../../../types';

export type GetCatalogFlowVariables = {
  id: AiCatalogItemID;
};

export type GetCatalogFlowData = {
  aiCatalogItem: AiCatalogFlowItem | null;
};

export const GetCatalogFlowQuery: GraphQLOperation<GetCatalogFlowData> = {
  supportedSinceInstanceVersion: '18.8.0',
  query: gql`
    query lsp_getCatalogFlow($id: AiCatalogItemID!) {
      aiCatalogItem(id: $id) {
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
            definition
          }
        }
      }
    }
  `,
  fallback: (event: FallbackEvent): GetCatalogFlowData => {
    if (event.err) {
      throw new Error(`Error fetching catalog flow: ${event.err}`, {
        cause: event.err,
      });
    }

    return { aiCatalogItem: null };
  },
};
