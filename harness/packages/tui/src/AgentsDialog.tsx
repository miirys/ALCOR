import React from 'react';
import type { AgentsDialogInputState } from './types';
import { SearchableCommandDialog } from './SearchableCommandDialog';

export interface AgentsDialogCallbacks {
  onClose: () => void;
  onSelect: (agentName: string) => void;
}

interface AgentsDialogProps {
  input: AgentsDialogInputState;
  callbacks: AgentsDialogCallbacks;
}

export const agentsFooterHint = (input: AgentsDialogInputState): string | null =>
  input.agents.length > 0 ? '↑/↓ to navigate • Enter to run • Esc to close' : 'Esc to close';

export const AgentsDialog: React.FC<AgentsDialogProps> = ({ input, callbacks }) => (
  <SearchableCommandDialog
    items={input.agents}
    placeholder="Type to filter agents..."
    emptyText="No agents are available in this project."
    noMatchesText="No matching agents"
    callbacks={callbacks}
  />
);
