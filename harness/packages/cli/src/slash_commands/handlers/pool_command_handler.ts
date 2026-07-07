import { Injectable } from '@gitlab/needle';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { SlashCommandHandler } from '../slash_command_handler';
import { getPoolBridgeStatus, type PoolGroupStatus } from '../../pool/pool_bridge_status';

/**
 * `/pool` — prints the in-process pool bridge status: the log-server URL (so
 * it's reachable after boot, not just from the one-time boot print), the active
 * group + its ledger balance, each standby's balance + ready/exhausted state,
 * and the threshold. Reads the process-wide status holder that startPoolBridge
 * populates (the bridge is fire-and-forget and not in the DI graph).
 */
@Injectable(SlashCommandHandler, [])
export class DefaultPoolCommandHandler implements SlashCommandHandler {
  command = {
    name: '/pool',
    description: 'Show pool bridge status (active group, credits, log URL)',
    action: 'pool',
  } as const;

  async execute(api: ControllerApi): Promise<void> {
    const status = getPoolBridgeStatus();
    if (!status) {
      api.showInfo(
        'Pool bridge is not running. Enable it with DUOX_POOL_BRIDGE=1 to pool Duo credit groups.',
      );
      return;
    }

    const s = status.getSnapshot();
    const used = (g: PoolGroupStatus) => `${g.creditsUsed.toFixed(2)}/${g.creditsCap}`;
    const state = (g: PoolGroupStatus) => {
      if (g.exhausted) return 'exhausted';
      return g.ready ? 'ready' : 'provisioning';
    };

    const active = s.groups.find((g) => g.active);
    const standbys = s.groups.filter((g) => !g.active);

    const lines: string[] = [
      'GitLab Duo pool bridge',
      `  logs:      ${s.logUrl ?? '(log server not started)'}`,
      `  threshold: ${s.thresholdCredits} / ${s.creditsCap} credits`,
      active
        ? `  active:    ${active.id}  (${used(active)} used, ${state(active)})`
        : '  active:    (none)',
    ];
    if (standbys.length) {
      lines.push('  standby:');
      for (const g of standbys) lines.push(`    - ${g.id}  (${used(g)}, ${state(g)})`);
    } else {
      lines.push('  standby:   (none yet — provisioning in background)');
    }

    api.showInfo(lines.join('\n'));
  }
}
