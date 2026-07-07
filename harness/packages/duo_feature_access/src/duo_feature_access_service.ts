import { createInterfaceId } from '@gitlab/needle';
import { DuoFeature } from './duo_feature';
import { DuoCodeSuggestionsContext } from './duo_code_suggestions_context';

export interface DuoFeatureAccessService {
  isChatFeatureEnabled(feature: DuoFeature): Promise<boolean>;
  isSuggestionsFeatureEnabled(feature: DuoCodeSuggestionsContext): Promise<boolean>;
}

export const DuoFeatureAccessService =
  createInterfaceId<DuoFeatureAccessService>('DuoFeatureAccessService');
