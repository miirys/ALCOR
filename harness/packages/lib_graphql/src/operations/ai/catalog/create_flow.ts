import { gql } from 'graphql-request';
import { AiCatalogFlowItem, FallbackEvent, GraphQLOperation, ProjectID } from '../../../types';

export type CreateCatalogFlowVariables = {
  projectId: ProjectID;
  name: string;
  description: string;
  public: boolean;
  definition: string;
};

export type CreateCatalogFlowData = {
  aiCatalogFlowCreate: {
    item: AiCatalogFlowItem | null;
    errors: string[];
  };
};

export const CreateCatalogFlowMutation: GraphQLOperation<CreateCatalogFlowData> = {
  supportedSinceInstanceVersion: '18.8.0',
  query: gql`
    mutation lsp_createCatalogFlow(
      $projectId: ProjectID!
      $name: String!
      $description: String!
      $public: Boolean!
      $definition: String!
    ) {
      aiCatalogFlowCreate(
        input: {
          projectId: $projectId
          name: $name
          description: $description
          public: $public
          definition: $definition
        }
      ) {
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
  fallback: (event: FallbackEvent): CreateCatalogFlowData => {
    if (event.err) {
      throw new Error(`Error creating catalog flow: ${event.err}`, {
        cause: event.err,
      });
    }

    throw new Error('Catalog flow creation requires GitLab 18.8 or later');
  },
};
