import { DefaultDuoApiProjectAccessCache } from './api_project_access_cache';
import { DefaultDuoFeatureAccessService } from './duo_feature_access_service';
import { DefaultDuoProjectAccessChecker } from './project_access_checker';
import { DefaultDuoWorkspaceProjectAccessCache } from './workspace_project_access_cache';
import { DefaultDuoExclusionChecker } from './exclusion_checker';
import { DefaultCodeSuggestionsDirectAccessService } from './code_suggestions_direct_access_service';

export const duoAccessContributions = [
  DefaultDuoProjectAccessChecker,
  DefaultDuoWorkspaceProjectAccessCache,
  DefaultDuoApiProjectAccessCache,
  DefaultDuoFeatureAccessService,
  DefaultDuoExclusionChecker,
  DefaultCodeSuggestionsDirectAccessService,
] as const;
