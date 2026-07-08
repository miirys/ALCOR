import { Injectable } from '@gitlab/needle';
import {
  CLI_INPUT_TYPES,
  defaultInputState,
  PoolPanelInput,
  poolPanelFooterHint,
  type PoolPanelCallbacks,
  type PoolPanelGroup,
} from '@gitlab-org/tui';
import type { ControllerApi } from '../../commands/tui/controller_api';
import { SlashCommandHandler, type CommandComponentEntry } from '../slash_command_handler';
import { getPoolBridgeStatus } from '../../pool/pool_bridge_status';

/**
 * `/pool` — the ALCOR pool-bridge panel: the log-server URL (so it's reachable
 * after boot, not just from the one-time boot print), the active group + its
 * ledger balance as a credit meter, each standby's balance + ready/exhausted
 * state, and the rotation threshold. Reads the process-wide status holder that
 * startPoolBridge populates (the bridge is fire-and-forget and not in the DI
 * graph) — presentation only, the bridge itself is never touched.
 */
@Injectable(SlashCommandHandler, [])
export class DefaultPoolCommandHandler implements SlashCommandHandler<PoolPanelCallbacks> {
  command = {
    name: '/pool',
    description: 'Pool bridge status · groups, credits, log URL',
    action: 'pool',
  } as const;

  async execute(api: ControllerApi): Promise<void> {
    const status = getPoolBridgeStatus();

    if (!status) {
      api.mutateState((state) => ({
        ...state,
        input: { inputType: CLI_INPUT_TYPES.POOL_PANEL, running: false, groups: [] },
      }));
      return;
    }

    const s = status.getSnapshot();
    const groups: PoolPanelGroup[] = s.groups.map((g) => ({
      id: g.id,
      active: g.active,
      creditsUsed: g.creditsUsed,
      creditsCap: g.creditsCap,
      ready: g.ready,
      exhausted: g.exhausted,
    }));

    api.mutateState((state) => ({
      ...state,
      input: {
        inputType: CLI_INPUT_TYPES.POOL_PANEL,
        running: true,
        logUrl: s.logUrl ?? undefined,
        thresholdCredits: s.thresholdCredits,
        creditsCap: s.creditsCap,
        groups,
      },
    }));
  }

  getComponent(api: ControllerApi): CommandComponentEntry<PoolPanelCallbacks> {
    return {
      inputType: CLI_INPUT_TYPES.POOL_PANEL,
      component: PoolPanelInput,
      footerHint: poolPanelFooterHint,
      callbacks: {
        onClose: () => {
          api.mutateState((state) => ({ ...state, input: defaultInputState }));
        },
      },
    };
  }
}
