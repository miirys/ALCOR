import { CreditLedger, type LedgerStorage } from '@gitlab-org/credit-ledger';
import type { UserPersistentStorage } from '@gitlab-org/persistent-storage';
import { CheckpointAttributionTracker, isBillableFrame } from './checkpoint_attribution';
import { CreditAttributionAdapter } from './credit_attribution_adapter';

const MODEL = 'claude-sonnet-4.6'; // 2.0 calls/credit => 0.5 credits per call
const CALLS_PER_CREDIT = 2.0;

const nullLogger = { info() {}, warn() {}, debug() {} };

function frame(
  messageType: 'user' | 'agent' | 'request' | 'tool',
  overrides: Record<string, unknown> = {},
) {
  return {
    message_type: messageType,
    message_sub_type: null,
    content: '',
    timestamp: `t-${Math.random()}`,
    status: null,
    correlation_id: null,
    additional_context: null,
    tool_info: null,
    ...overrides,
  };
}

const toolCall = () => frame('request', { tool_info: { name: 'run_command', args: {} } });
const toolResult = () => frame('tool', { tool_info: { name: 'run_command', args: {} } });
const agentMsg = (content = 'done') => frame('agent', { content });
const userMsg = (content = 'hi') => frame('user', { content });

function checkpoint(id: string, uiChatLog: unknown[]) {
  return {
    checkpoint: JSON.stringify({ id, channel_values: { ui_chat_log: uiChatLog } }),
    errors: [] as string[],
    workflowGoal: 'g',
    workflowStatus: 'RUNNING',
  };
}

async function newLedger(): Promise<CreditLedger> {
  let state: unknown;
  const storage: LedgerStorage = {
    read: async () => state as never,
    write: async (v) => {
      state = v;
    },
  };
  const ledger = new CreditLedger({
    perGroupCapCredits: 24,
    thresholdFraction: 0.9,
    storage,
    logger: nullLogger,
  });
  await ledger.load();
  ledger.setActiveGroup('g1');
  return ledger;
}

describe('isBillableFrame', () => {
  it('counts agent messages and model-driven tool calls, not results/user', () => {
    expect(isBillableFrame(agentMsg() as never)).toBe(true);
    expect(isBillableFrame(toolCall() as never)).toBe(true);
    expect(isBillableFrame(toolResult() as never)).toBe(false);
    expect(isBillableFrame(userMsg() as never)).toBe(false);
    // plan-approval request (tool_info null) is not a model call
    expect(isBillableFrame(frame('request', { tool_info: null }) as never)).toBe(false);
  });
});

describe('CheckpointAttributionTracker', () => {
  it('attributes each new billable frame exactly once across cumulative checkpoints', () => {
    const t = new CheckpointAttributionTracker();
    const base = [userMsg(), toolCall()];
    // cumulative stream: tool_call -> tool_result -> tool_call -> tool_result -> final
    const c1 = [...base];
    const c2 = [...c1, toolResult()];
    const c3 = [...c2, toolCall()];
    const c4 = [...c3, toolResult()];
    const c5 = [...c4, agentMsg()];

    const count = (ev: { checkpoint: string }) => t.framesToAttribute(ev, 'wf').length;
    expect(count(checkpoint('cp1', c1))).toBe(1); // tool_call #1
    expect(count(checkpoint('cp2', c2))).toBe(0); // tool_result #1
    expect(count(checkpoint('cp3', c3))).toBe(1); // tool_call #2
    expect(count(checkpoint('cp4', c4))).toBe(0); // tool_result #2
    expect(count(checkpoint('cp5', c5))).toBe(1); // final agent message
  });

  it('seedResume skips already-counted history on a resumed workflow', () => {
    const t = new CheckpointAttributionTracker();
    const history = [userMsg(), toolCall(), toolResult(), agentMsg()];
    const first = checkpoint('cpN', history);
    t.seedResume(first, 'wf');
    expect(t.framesToAttribute(first, 'wf')).toHaveLength(0);
    // a genuinely new frame after resume is still counted
    const next = checkpoint('cpN1', [...history, toolCall()]);
    expect(t.framesToAttribute(next, 'wf')).toHaveLength(1);
  });
});

describe('end-to-end: tool-using turn accumulates real credits', () => {
  it('a 2-round tool turn records 3 billable calls and >2 calls of credit', async () => {
    const ledger = await newLedger();
    const storage = {
      get: jest.fn().mockResolvedValue(MODEL),
    } as unknown as UserPersistentStorage;
    const factory = { get: async () => ledger } as never;
    const adapter = new CreditAttributionAdapter(factory, storage, nullLogger as never);
    const tracker = new CheckpointAttributionTracker();

    const base = [userMsg(), toolCall()];
    const checkpoints = [
      checkpoint('cp1', [...base]),
      checkpoint('cp2', [...base, toolResult()]),
      checkpoint('cp3', [...base, toolResult(), toolCall()]),
      checkpoint('cp4', [...base, toolResult(), toolCall(), toolResult()]),
      checkpoint('cp5', [...base, toolResult(), toolCall(), toolResult(), agentMsg()]),
    ];

    for (const ev of checkpoints) {
      // eslint-disable-next-line no-await-in-loop
      await Promise.all(
        tracker
          .framesToAttribute(ev, 'wf')
          .map((call) =>
            adapter.onLlmCall({ workflowId: 'wf', sessionId: 'wf', callId: call.callId }),
          ),
      );
    }

    const snap = ledger.getActiveSnapshot();
    expect(snap?.eventCount).toBe(3); // 2 tool_calls + 1 final agent message
    expect(snap?.creditsUsed).toBeGreaterThan(2 * (1 / CALLS_PER_CREDIT));
    expect(snap?.creditsUsed).toBeCloseTo(3 * (1 / CALLS_PER_CREDIT), 5);
  });
});
