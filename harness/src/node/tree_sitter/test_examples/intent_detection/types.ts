import { type SuggestionContext } from '@gitlab-org/legacy-common';

export type IntentDetectionExamples = {
  completion: SuggestionContext[];
  generation: SuggestionContext[];
};
