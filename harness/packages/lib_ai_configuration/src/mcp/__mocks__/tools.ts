// Mock tools for MCP manager tests

export const mockExpectedTools = [
  // Tools from test-server
  {
    name: 'test-server_tool1',
    originalToolName: 'tool1',
    description: 'Test tool 1',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: { input: { type: 'string' } },
    }),
  },
  {
    name: 'test-server_tool2',
    originalToolName: 'tool2',
    description: 'Test tool 2',
    inputSchema: '{ "type": "object", "properties": { "input": { "type": "string" } } }',
  },
  // Tools from another-server
  {
    name: 'another-server_tool1',
    originalToolName: 'tool1',
    description: 'Test tool 1',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: { input: { type: 'string' } },
    }),
  },
  {
    name: 'another-server_tool2',
    originalToolName: 'tool2',
    description: 'Test tool 2',
    inputSchema: '{ "type": "object", "properties": { "input": { "type": "string" } } }',
  },
  // Tools from http-server
  {
    name: 'http-server_tool1',
    originalToolName: 'tool1',
    description: 'Test tool 1',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: { input: { type: 'string' } },
    }),
  },
  {
    name: 'http-server_tool2',
    originalToolName: 'tool2',
    description: 'Test tool 2',
    inputSchema: '{ "type": "object", "properties": { "input": { "type": "string" } } }',
  },
  // Tools from library Docs
  {
    name: 'library_docs_tool1',
    originalToolName: 'tool1',
    description: 'Test tool 1',
    inputSchema: JSON.stringify({
      type: 'object',
      properties: { input: { type: 'string' } },
    }),
  },
  {
    name: 'library_docs_tool2',
    originalToolName: 'tool2',
    description: 'Test tool 2',
    inputSchema: '{ "type": "object", "properties": { "input": { "type": "string" } } }',
  },
];
