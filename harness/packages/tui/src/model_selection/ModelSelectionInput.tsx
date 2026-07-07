import React, { useState } from 'react';
import { Box, Text, useStdout } from 'ink';
import type { ModelListItem, ModelSelectionInputState } from '../types';
import { SearchableList } from '../lib/components/SearchableList';

export interface ModelSelectionCallbacks {
  onCancelModelSelection: () => void;
  onSelectModel: (ref: string, name: string) => void;
}

interface ModelSelectionInputProps {
  input: ModelSelectionInputState;
  callbacks: ModelSelectionCallbacks;
}

const MAX_LIST_WIDTH = 120;

export const modelSelectionFooterHint = (input: ModelSelectionInputState): string | null =>
  input.models.length > 0 ? '↑/↓ to select • Enter to apply • Esc to cancel' : 'Esc to cancel';

interface ModelItemProps {
  item: ModelListItem;
  isSelected: boolean;
  currentModel: string;
}

const ModelItem: React.FC<ModelItemProps> = ({ item, isSelected, currentModel }) => {
  const isCurrent = item.ref === currentModel;
  return (
    <Box
      flexDirection="row"
      borderLeft
      borderRight={false}
      borderTop={false}
      borderBottom={false}
      borderStyle="bold"
      borderColor={isSelected ? '#8a8a94' : '#2a2a32'}
      paddingLeft={1}
      gap={1}
    >
      <Text bold={isSelected} wrap="truncate">
        {item.name}
      </Text>
      {isCurrent && <Text dimColor>(current)</Text>}
    </Box>
  );
};

export const ModelSelectionInput: React.FC<ModelSelectionInputProps> = ({ input, callbacks }) => {
  const { stdout } = useStdout();
  const listWidth = Math.min(stdout?.columns || 80, MAX_LIST_WIDTH);
  const [filteredModels, setFilteredModels] = useState<ModelListItem[]>(input.models);

  const handleSearchChange = (query: string) => {
    if (!query.trim()) {
      setFilteredModels(input.models);
      return;
    }
    const lowerQuery = query.toLowerCase();
    setFilteredModels(
      input.models.filter(
        (m) =>
          m.name.toLowerCase().includes(lowerQuery) || m.ref.toLowerCase().includes(lowerQuery),
      ),
    );
  };

  const ItemComponent = ({ item, isSelected }: { item: ModelListItem; isSelected: boolean }) => (
    <ModelItem item={item} isSelected={isSelected} currentModel={input.currentModel} />
  );

  return (
    <SearchableList
      items={filteredModels}
      getItemKey={(model) => model.ref}
      ItemComponent={ItemComponent}
      placeholder="Type to filter models..."
      onSearchChange={handleSearchChange}
      emptyText="No selectable models available"
      onSelect={(model) => callbacks.onSelectModel(model.ref, model.name)}
      onCancel={() => callbacks.onCancelModelSelection()}
      width={listWidth}
      isLoading={input.isLoading}
      loadingText="Loading available models..."
      showSeparators={false}
    />
  );
};
