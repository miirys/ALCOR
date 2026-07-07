import { createInterfaceId } from '@gitlab/needle';

export interface SelectedModel {
  modelRef: string;
  modelName: string;
}

interface SelectableModel {
  ref: string;
  name: string;
}

export interface AvailableModelsResult {
  models: SelectableModel[];
}

export interface ModelManager {
  getModel(): SelectedModel;
  setModel(model: SelectedModel): void;
  onModelChanged(callback: (model: SelectedModel) => void): () => void;
  initialize(): Promise<void>;
  saveModel(model: SelectedModel): Promise<void>;
  getAvailableModels(): Promise<AvailableModelsResult>;
}

export const ModelManager = createInterfaceId<ModelManager>('ModelManager');
