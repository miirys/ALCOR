import { FlowV1Schema } from './schema';

function makeRawV1(component: Record<string, unknown>): unknown {
  return {
    version: 'v1',
    environment: 'ambient',
    components: [
      {
        name: 'step_one',
        type: 'AgentComponent',
        prompt_id: 'p1',
        toolset: [],
        ...component,
      },
    ],
    routers: [{ from: 'step_one', to: 'end' }],
    flow: { entry_point: 'step_one' },
  };
}

describe('FlowV1Schema component inputs', () => {
  it('accepts the object form `{from, as}` and preserves all fields', () => {
    const raw = makeRawV1({
      inputs: [{ from: 'context:goal', as: 'goal', optional: true }],
    });

    const parsed = FlowV1Schema.parse(raw);

    expect(parsed.components[0]?.inputs).toEqual([
      { from: 'context:goal', as: 'goal', literal: undefined, optional: true },
    ]);
  });

  it('accepts the string shorthand and normalizes it to the object form', () => {
    const raw = makeRawV1({ inputs: ['context:goal'] });

    const parsed = FlowV1Schema.parse(raw);

    expect(parsed.components[0]?.inputs).toEqual([
      { from: 'context:goal', as: undefined, literal: undefined, optional: undefined },
    ]);
  });

  it('accepts a mix of string shorthand and object form in the same list', () => {
    const raw = makeRawV1({
      inputs: ['context:goal', { from: 'context:project_id', as: 'project_id' }],
    });

    const parsed = FlowV1Schema.parse(raw);

    expect(parsed.components[0]?.inputs).toEqual([
      { from: 'context:goal', as: undefined, literal: undefined, optional: undefined },
      { from: 'context:project_id', as: 'project_id', literal: undefined, optional: undefined },
    ]);
  });
});
