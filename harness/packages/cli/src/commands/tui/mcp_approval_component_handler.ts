import { Implements, Service, ServiceLifetime } from '@gitlab/needle';
import type { McpApprovalCallbacks } from '@gitlab-org/tui';
import {
  SlashCommandAction,
  SlashCommandHandler,
  type CommandComponentEntry,
} from '../../slash_commands/slash_command_handler';
import type { ControllerApi } from './controller_api';
import { McpApprovalController } from './mcp_approval_controller';

/**
 * Thin SlashCommandHandler that registers the MCP_APPROVAL component in the static
 * CommandComponentRegistry by delegating to the controller. It is NOT a user-facing
 * command: `execute` is a no-op and the command is marked internal so it is filtered
 * out of the slash-command list / autocomplete.
 */
@Implements(SlashCommandHandler)
@Service({
  dependencies: [McpApprovalController],
  lifetime: ServiceLifetime.Singleton,
})
export class McpApprovalComponentHandler implements SlashCommandHandler<McpApprovalCallbacks> {
  #controller: McpApprovalController;

  command = {
    name: '/__mcp_approval',
    description: 'Internal: MCP server approval prompt',
    action: SlashCommandAction.McpApproval,
    internal: true,
  } as const;

  constructor(controller: McpApprovalController) {
    this.#controller = controller;
  }

  // No-op: this handler exists only to register its component.
  async execute(): Promise<void> {}

  getComponent(api: ControllerApi): CommandComponentEntry<McpApprovalCallbacks> {
    return this.#controller.getComponent(api);
  }
}
