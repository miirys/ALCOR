import React from 'react';
import type { SkillsDialogInputState } from './types';
import { SearchableCommandDialog } from './SearchableCommandDialog';

export interface SkillsDialogCallbacks {
  onClose: () => void;
  onSelect: (skillName: string) => void;
}

interface SkillsDialogProps {
  input: SkillsDialogInputState;
  callbacks: SkillsDialogCallbacks;
}

export const skillsFooterHint = (input: SkillsDialogInputState): string | null =>
  input.skills.length > 0 ? '↑/↓ to navigate • Enter to run • Esc to close' : 'Esc to close';

export const SkillsDialog: React.FC<SkillsDialogProps> = ({ input, callbacks }) => (
  <SearchableCommandDialog
    items={input.skills}
    placeholder="Type to filter skills..."
    emptyText="No skills are available in this project."
    noMatchesText="No matching skills"
    callbacks={callbacks}
  />
);
