export interface AiModelSelectionOfferedModel {
  name: string;
  ref: string;
}

export interface AvailableModels {
  defaultModel: AiModelSelectionOfferedModel | null;
  selectableModels: AiModelSelectionOfferedModel[];
  pinnedModel: AiModelSelectionOfferedModel | null;
}

export interface FoundationalChatAgents {
  nodes: FoundationalChatAgent[];
}

export interface FoundationalChatAgent {
  id: string;
  name: string;
  description: string;
  referenceWithVersion: string;
  selectableInChat?: boolean;
}
