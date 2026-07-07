import { gql } from 'graphql-request';
import { FallbackEvent, GraphQLOperation, ProjectID } from '../../types';

export type GetUserProjectPermissionsVariables = {
  projectPath: string;
};

/**
 * Subset of `Project.userPermissions` we surface to the canvas.
 *
 * `pushCode`, `adminProject`, `removeProject` give us a coarse role tier
 * (Developer / Maintainer / Owner) for the session indicator.
 *
 * `adminAiCatalogItem` and `readAiCatalogItem` are the ground truth for
 * AI-Catalog-specific gating — namespace policies can grant these to
 * roles below the typical "Maintainer+" default, so we ask the server
 * rather than inferring from role.
 *
 * The AI Catalog fields were introduced in 18.3 as Experiment and are
 * already marked deprecated upstream; if/when a non-deprecated successor
 * lands, this is where to swap. They may be `null` on instances that
 * stripped them via the `@gl_introduced` directive.
 */
export type ProjectUserPermissions = {
  pushCode: boolean;
  adminProject: boolean;
  removeProject: boolean;
  adminAiCatalogItem: boolean | null;
  readAiCatalogItem: boolean | null;
};

export type GetUserProjectPermissionsData = {
  project: {
    id: ProjectID;
    userPermissions: ProjectUserPermissions;
  } | null;
};

export const GetUserProjectPermissionsQuery: GraphQLOperation<GetUserProjectPermissionsData> = {
  supportedSinceInstanceVersion: '0.0.0',
  query: gql`
    query lsp_getUserProjectPermissions($projectPath: ID!) {
      project(fullPath: $projectPath) {
        id
        userPermissions {
          pushCode
          adminProject
          removeProject
          adminAiCatalogItem @gl_introduced(version: "18.3.0")
          readAiCatalogItem @gl_introduced(version: "18.3.0")
        }
      }
    }
  `,
  fallback: (event: FallbackEvent): GetUserProjectPermissionsData => {
    if (event.err) {
      throw new Error(`Error fetching project permissions: ${event.err}`, {
        cause: event.err,
      });
    }
    return { project: null };
  },
};
