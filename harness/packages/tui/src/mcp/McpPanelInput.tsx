import React from 'react';

import { ConnectionState, type McpPanelInputState, type McpPanelListItem } from '../types';
import { McpPanelView } from '../constants';
import { useKeyHandler } from '../lib/key_handler';
import { McpServerList } from './McpServerList';
import { McpServerDetail } from './McpServerDetail';

export interface McpPanelCallbacks {
  onSelectItem: (item: McpPanelListItem) => void;
  onAuthenticate: (serverName: string) => void;
  onBack: () => void;
  onCancel: () => void;
}

interface McpPanelInputProps {
  input: McpPanelInputState;
  callbacks: McpPanelCallbacks;
}

export const mcpPanelFooterHint = (input: McpPanelInputState): string | null => {
  const { panelView } = input;
  if (panelView.view !== McpPanelView.ServerDetail) {
    return '↑/↓ to navigate • Enter to select • Esc to close';
  }
  const hasAuthServer =
    panelView.server.connectionState === ConnectionState.Authenticating && panelView.server.authUrl;
  return hasAuthServer ? 'Enter to authenticate • Esc to go back' : 'Esc to go back';
};

export const McpPanelInput: React.FC<McpPanelInputProps> = ({ input, callbacks }) => {
  const { panelView } = input;

  useKeyHandler((event) => {
    if (event.eventType !== 'press') return;

    if (event.name === 'escape') {
      if (panelView.view === McpPanelView.ServerDetail) {
        callbacks.onBack();
      } else {
        callbacks.onCancel();
      }
      event.stopPropagation();
      return;
    }

    if (event.ctrl && event.name === 'c') {
      callbacks.onCancel();
      event.stopPropagation();
    }
  });

  const content =
    panelView.view === McpPanelView.ServerDetail ? (
      <McpServerDetail panelView={panelView} callbacks={callbacks} />
    ) : (
      <McpServerList
        panelView={panelView}
        servers={input.servers}
        selectedIndex={input.selectedIndex}
        callbacks={callbacks}
      />
    );

  return content;
};
