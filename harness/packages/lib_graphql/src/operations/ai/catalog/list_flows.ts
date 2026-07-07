import { gql } from 'graphql-request';
import { AiCatalogFlowConnection, FallbackEvent, GraphQLOperation } from '../../../types';

export type ListCatalogFlowsVariables = {
  search: string | null;
  first: number | null;
  after: string | null;
};

export type ListCatalogFlowsData = {
  aiCatalogItems: AiCatalogFlowConnection;
};

export const ListCatalogFlowsQuery: GraphQLOperation<ListCatalogFlowsData> = {
  supportedSinceInstanceVersion: '18.8.0',
  query: gql`
    query lsp_listCatalogFlows($search: String, $first: Int, $after: String) {
      aiCatalogItems(itemTypes: [FLOW], search: $search, first: $first, after: $after) {
        pageInfo {
          startCursor
          endCursor
          hasNextPage
          hasPreviousPage
        }
        edges {
          node {
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
        }
      }
    }
  `,
  fallback: (event: FallbackEvent): ListCatalogFlowsData => {
    if (event.err) {
      throw new Error(`Error listing catalog flows: ${event.err}`, {
        cause: event.err,
      });
    }

    return {
      aiCatalogItems: {
        edges: null,
        pageInfo: {
          startCursor: '',
          endCursor: '',
          hasNextPage: false,
          hasPreviousPage: false,
        },
      },
    };
  },
};
