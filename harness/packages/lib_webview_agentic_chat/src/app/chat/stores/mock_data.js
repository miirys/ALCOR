export const paginationPayload = {
  type: 'foundational_chat_agents',
  after: null,
  first: 20,
  last: null,
  before: null,
};

export const workflowsData = [
  {
    id: 'gid://gitlab/DuoWorkflow/1',
    goal: 'Test Goal 1',
    status: 'ACTIVE',
    createdAt: '2022-10-28T10:00:00Z',
    updatedAt: '2022-10-28T11:00:00Z',
    humanStatus: 'ACTIVE',
    checkpoint: null,
  },
  {
    id: 'gid://gitlab/DuoWorkflow/2',
    goal: 'Test Goal 2',
    status: 'PENDING',
    createdAt: '2022-10-29T10:00:00Z',
    updatedAt: '2022-10-29T11:00:00Z',
    humanStatus: 'PENDING',
    checkpoint: null,
  },
];

export const workflowsPayload = {
  duoWorkflowWorkflows: {
    edges: workflowsData.map((workflow) => ({ node: workflow })),
    pageInfo: { startCursor: 'startCursor', endCursor: 'endCursor' },
  },
};
