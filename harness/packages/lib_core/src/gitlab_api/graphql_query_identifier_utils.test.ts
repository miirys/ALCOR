import { extractGraphQLOperationLabel } from './graphql_query_identifier_utils';

describe('extractGraphQLOperationLabel', () => {
  describe.each([
    [
      'query featureFlagsEnabled($name: String!) {\n  featureFlagEnabled(name: $name)\n}',
      'query: featureFlagsEnabled',
    ],
    [
      'query getProject($projectPath: ID!) {\n  project(fullPath: $projectPath) {\n    id\n    name\n  }\n}',
      'query: getProject',
    ],
    [
      'query getCurrentUser {\n  currentUser {\n    id\n    username\n  }\n}',
      'query: getCurrentUser',
    ],
  ])('query operations', (graphqlQuery, expected) => {
    it(`should extract label from: ${graphqlQuery.split('\n')[0]}`, () => {
      expect(extractGraphQLOperationLabel(graphqlQuery)).toBe(expected);
    });
  });

  describe.each([
    [
      'mutation chat($question: String!, $resourceId: AiModelID) {\n  aiAction(input: { chat: { content: $question } }) {\n    requestId\n  }\n}',
      'mutation: chat',
    ],
    [
      'mutation deleteWorkflow($id: ID!) {\n  deleteWorkflow(input: { id: $id }) {\n    success\n    errors\n  }\n}',
      'mutation: deleteWorkflow',
    ],
    [
      'mutation updateUser($userId: ID!, $input: UserInput!) {\n  updateUser(userId: $userId, input: $input) {\n    user {\n      id\n    }\n  }\n}',
      'mutation: updateUser',
    ],
  ])('mutation operations', (graphqlQuery, expected) => {
    it(`should extract label from: ${graphqlQuery.split('\n')[0]}`, () => {
      expect(extractGraphQLOperationLabel(graphqlQuery)).toBe(expected);
    });
  });

  describe.each([
    [
      'subscription workflowEventsUpdated($workflowId: AiDuoWorkflowsWorkflowID!) {\n  workflowEventsUpdated(workflowId: $workflowId) {\n    checkpoint\n    workflowStatus\n  }\n}',
      'subscription: workflowEventsUpdated',
    ],
    [
      'subscription aiCompletionResponse($resourceId: AiModelID!) {\n  aiCompletionResponse(resourceId: $resourceId) {\n    content\n    role\n  }\n}',
      'subscription: aiCompletionResponse',
    ],
    [
      'subscription onCommentAdded($issueId: ID!) {\n  commentAdded(issueId: $issueId) {\n    id\n    body\n  }\n}',
      'subscription: onCommentAdded',
    ],
  ])('subscription operations', (graphqlQuery, expected) => {
    it(`should extract label from: ${graphqlQuery.split('\n')[0]}`, () => {
      expect(extractGraphQLOperationLabel(graphqlQuery)).toBe(expected);
    });
  });

  describe.each([
    ['query {\n  currentUser {\n    id\n  }\n}', 'query: anonymous'],
    ['mutation {\n  deleteAllWorkflows {\n    success\n  }\n}', 'mutation: anonymous'],
    ['subscription {\n  allEvents {\n    type\n  }\n}', 'subscription: anonymous'],
    ['{\n  currentUser {\n    id\n  }\n}', undefined],
  ])('anonymous operations', (graphqlQuery, expected) => {
    it(`should return ${expected} for anonymous: ${graphqlQuery.split('\n')[0]}`, () => {
      expect(extractGraphQLOperationLabel(graphqlQuery)).toBe(expected);
    });
  });
});
