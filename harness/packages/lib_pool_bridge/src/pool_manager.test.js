import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { GroupPoolManager } from './pool_manager.js';

// Minimise the namespace-propagation sleep so switches are ~instant in tests.
process.env.DUO_BRIDGE_NAMESPACE_SETTLE_MS = '1';

const nullLog = { info() {}, warn() {}, error() {}, debug() {}, cat() { return nullLog; } };
const creds = { getCredentials: async () => ({ token: 't', baseUrl: 'https://gitlab.com' }) };

/**
 * Fake ledger — the SINGLE SOURCE OF TRUTH for fundedness. Snapshots are keyed
 * by group id; a MISSING snapshot means "adopted / unknown => assume funded".
 */
class FakeLedger {
  constructor(snaps = {}) {
    this.snaps = snaps;
  }

  getSnapshot(id) {
    return this.snaps[id];
  }

  markExhausted(id) {
    this.snaps[id] = this.snaps[id] || {
      creditsUsed: 0,
      creditsCap: 24,
      thresholdCredits: 21.6,
      exhausted: false,
    };
    this.snaps[id].exhausted = true;
  }

  forgetGroup(id) {
    delete this.snaps[id];
  }
}

const exhausted = () => ({ exhausted: true, creditsUsed: 24, creditsCap: 24, thresholdCredits: 21.6 });

/** In-memory automator: stubs group create/delete so no browser/network runs. */
class FakeAutomator {
  constructor() {
    this.created = [];
    this.deleted = [];
  }

  async getNamespaceNumericId() {
    return 4242;
  }

  async setDefaultDuoNamespaceViaGraphQL() {
    return true;
  }

  // Throwing here means discoverAndAdoptGroups() takes its no-prune path, so
  // seeded groups survive the reloads ensureStandbyGroups() performs.
  async listOwnedDuoPoolGroups() {
    throw new Error('listing disabled in test');
  }

  async cleanUpAllInactiveGroups() {}

  async deleteGroupImmediately(groupId) {
    this.deleted.push(groupId);
  }

  async createGroup() {
    const id = `fresh-${this.created.length + 1}`;
    this.created.push(id);
    return { groupId: id, groupPath: id };
  }

  async activateTrialAndDuo() {}
}

function seedManager(state, snaps = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'pool-'));
  const statePath = join(dir, 'groups_pool.json');
  writeFileSync(statePath, JSON.stringify(state), 'utf8');
  const automator = new FakeAutomator();
  const ledger = new FakeLedger(snaps);
  const pm = new GroupPoolManager(
    {
      groupsPoolPath: statePath,
      automator,
      ledger,
      cookiesPath: '/dev/null',
      initialState: JSON.parse(JSON.stringify(state)),
    },
    nullLog,
  );
  return { pm, automator, ledger };
}

const ready = (id, extra = {}) => ({
  id,
  path: id,
  status: 'active',
  trialActive: true,
  namespaceSettled: true,
  numericId: 100,
  ...extra,
});

describe('ledger-driven pool routing', () => {
  it('reconcile drops only ledger-exhausted groups and keeps unknown/adopted ones', async () => {
    const { pm, automator } = seedManager(
      { groups: [ready('A'), ready('Z')], currentActiveId: 'A' },
      { Z: exhausted() }, // A has no snapshot => assumed funded
    );

    await pm.reconcilePool(creds);

    expect(automator.deleted).toContain('Z');
    expect(automator.deleted).not.toContain('A');
  });

  it('reconcile drops nothing when every group is unknown/adopted', async () => {
    const { pm, automator } = seedManager(
      { groups: [ready('A'), ready('B')], currentActiveId: 'A' },
      {}, // no snapshots at all
    );

    await pm.reconcilePool(creds);

    expect(automator.deleted).toEqual([]);
  });

  it('reconcile wipes ALL groups only when every group is ledger-exhausted', async () => {
    const { pm, automator } = seedManager(
      { groups: [ready('A'), ready('B')], currentActiveId: 'A' },
      { A: exhausted(), B: exhausted() },
    );

    await pm.reconcilePool(creds);

    expect(automator.deleted).toContain('A');
    expect(automator.deleted).toContain('B');
  });

  it('rotation picks the funded ready standby, skipping an exhausted one and never creating fresh', async () => {
    const { pm, automator } = seedManager(
      { groups: [ready('A'), ready('Z'), ready('C')], currentActiveId: 'A' },
      { Z: exhausted() }, // C has no snapshot => funded; Z is exhausted => skipped
    );

    await pm.rotateGroup(creds);

    expect(pm.getActiveGroup().id).toBe('C');
    expect(automator.created).toHaveLength(0);
  });

  it('an exhausted active group is switched to a funded standby before a message (no 402)', async () => {
    const { pm, automator } = seedManager(
      { groups: [ready('A'), ready('C')], currentActiveId: 'A' },
      { A: exhausted() }, // active A exhausted; C funded (no snapshot)
    );

    await pm.ensureCreditWorthyActiveGroup(creds);

    expect(pm.getActiveGroup().id).toBe('C');
    expect(automator.created).toHaveLength(0);
  });

  it('402: marking the active group exhausted makes the next pick land on a funded standby', async () => {
    const { pm, ledger } = seedManager(
      { groups: [ready('A'), ready('C')], currentActiveId: 'A' },
      {},
    );
    // Simulate the circuit breaker's response to a 402 USAGE_QUOTA_EXCEEDED.
    ledger.markExhausted('A');

    const standby = await pm.pickReadyStandby();
    expect(standby.id).toBe('C'); // funded standby, not the just-exhausted A
  });
});
