import type { ZodIssue } from 'zod';
import { NodeId } from '../../../utils/node';
import { mapZodIssuesToValidationIssues } from './zod_issue_mapper';
import type { FlowV1 } from './schema';

const makeIssue = (path: (string | number)[], message: string): ZodIssue =>
  ({
    code: 'custom',
    path,
    message,
  }) as unknown as ZodIssue;

const baseFlowV1 = (): FlowV1 => ({
  version: 'v1',
  environment: 'ambient',
  components: [
    {
      type: 'AgentComponent',
      name: 'Analyzer',
      prompt_id: 'analyzer_prompt',
      toolset: [],
    },
    {
      type: 'DeterministicStepComponent',
      name: 'Reader',
      tool_name: 'read_file',
      toolset: [],
    },
  ],
  routers: [{ from: 'Analyzer', to: 'Reader' }],
  flow: { entry_point: 'Analyzer' },
  prompts: [
    {
      prompt_id: 'analyzer_prompt',
      name: 'Analyzer Prompt',
      unit_primitives: [],
      prompt_template: { system: 's', user: 'u' },
    },
  ],
});

describe('mapZodIssuesToValidationIssues', () => {
  const analyzerId = 'aaa-1' as NodeId;
  const readerId = 'bbb-2' as NodeId;
  const nameToId = new Map<string, NodeId>([
    ['Analyzer', analyzerId],
    ['Reader', readerId],
  ]);

  it('routes a components.<N> issue to the owning node and translates the field path', () => {
    const issues = mapZodIssuesToValidationIssues(
      [makeIssue(['components', 0, 'prompt_id'], 'Required')],
      baseFlowV1(),
      nameToId,
    );

    expect(issues).toEqual([
      {
        severity: 'error',
        code: 'flow.schema',
        message: 'Required',
        nodeId: analyzerId,
        fieldPath: 'promptId',
      },
    ]);
  });

  it('translates nested camelCase paths under a routed component', () => {
    const issues = mapZodIssuesToValidationIssues(
      [makeIssue(['components', 1, 'tool_name'], 'Expected string')],
      baseFlowV1(),
      nameToId,
    );

    expect(issues[0]).toMatchObject({
      nodeId: readerId,
      fieldPath: 'toolName',
    });
  });

  it('routes a prompts.<N> issue to the owning component node and emits a localPrompt path', () => {
    const issues = mapZodIssuesToValidationIssues(
      [makeIssue(['prompts', 0, 'prompt_template', 'user'], 'Required')],
      baseFlowV1(),
      nameToId,
    );

    expect(issues[0]).toMatchObject({
      nodeId: analyzerId,
      fieldPath: 'localPrompt.promptTemplate.user',
    });
  });

  it('routes a routers.<N> issue to the source node', () => {
    const issues = mapZodIssuesToValidationIssues(
      [makeIssue(['routers', 0, 'to'], 'Required')],
      baseFlowV1(),
      nameToId,
    );

    expect(issues[0]).toMatchObject({
      nodeId: analyzerId,
      fieldPath: 'routers[0].to',
    });
  });

  it('emits a flow-level issue with translated path for flow.* paths', () => {
    const issues = mapZodIssuesToValidationIssues(
      [makeIssue(['flow', 'entry_point'], 'Required')],
      baseFlowV1(),
      nameToId,
    );

    expect(issues[0]).toEqual({
      severity: 'error',
      code: 'flow.schema',
      message: 'Required',
      fieldPath: 'flow.entryPoint',
    });
  });

  it('emits a flow-level issue when path is the components root (empty after root)', () => {
    const issues = mapZodIssuesToValidationIssues(
      [makeIssue(['components'], 'At least one component is required')],
      baseFlowV1(),
      nameToId,
    );

    expect(issues[0]).toEqual({
      severity: 'error',
      code: 'flow.schema',
      message: 'At least one component is required',
      fieldPath: 'components',
    });
  });

  it('omits fieldPath when the Zod path is empty (top-level)', () => {
    const issues = mapZodIssuesToValidationIssues(
      [makeIssue([], 'Invalid')],
      baseFlowV1(),
      nameToId,
    );

    expect(issues[0]).toEqual({
      severity: 'error',
      code: 'flow.schema',
      message: 'Invalid',
    });
  });

  it('falls back to flow-level routing when no nameToId is provided (toFlow case)', () => {
    const issues = mapZodIssuesToValidationIssues(
      [makeIssue(['components', 0, 'prompt_id'], 'Required')],
      undefined,
      undefined,
    );

    expect(issues[0]).toEqual({
      severity: 'error',
      code: 'flow.schema',
      message: 'Required',
      fieldPath: 'promptId',
    });
  });
});
