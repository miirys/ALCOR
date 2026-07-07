import {
  DefaultSecretRedactor,
  GitleaksRuleParser,
  GitLeaksRuleEvaluator,
} from '@gitlab-org/secret-redaction';
import { DefaultConfigService } from '@gitlab-org/config';
import { DefaultSystemContext, DefaultAuthContext } from '@gitlab-org/request-context';
import { DefaultLogger } from '@gitlab-org/logging';
import { DefaultErrorHandler, DefaultErrorNotifier } from '@gitlab-org/errors';
import { DefaultUserService } from '@gitlab-org/core';
import { GitLabAPI } from './api';
import { ProxyGitLabApiService } from './gitlab_api_service';
import { DefaultFeatureFlagService } from './feature_flags';
import { featureStateContributions } from './feature_state/contributions';
import { aiContextManagementContributions } from './ai_context_management/contributions';
import { DefaultOpenTabsService } from './open_tabs/open_tabs_service';
import { DefaultDocumentTransformerService } from './document_transformer_service';
import { DefaultIssueService, DefaultMergeRequestService } from './services/gitlab';
import { DefaultPostProcessorPipeline } from './suggestion_client/post_processors/default_post_processor_pipeline';
import { duoAccessContributions } from './services/duo_access/contributions';
import { telemetryContributions } from './tracking/contributions';
import { configurationValidationContributions } from './configuration_validation/contributions';
import { ConfigLogLevelProvider } from './config_log_level_provider';
import { connectionHandlersContributions } from './core/handlers/contributions';
import { DefaultDidChangeConfigurationHandler } from './core/handlers/did_change_configuration_handler';
import { DefaultConnectionDetailsService } from './suggestion/connection_details_service';
import { DefaultDirectConnectionDetailsService } from './suggestion/direct_connection_details_service';
import { DefaultSupportedLanguagesService } from './suggestion/supported_languages_service';
import { DefaultPreProcessorPipeline } from './suggestion_client/pre_processors/pre_processor_pipeline';
import { preProcessorContributions } from './suggestion_client/pre_processors/contributions';
import { DefaultSleepDetectionService } from './services/sleep_detection_service';

export const commonContributions = [
  ...featureStateContributions,
  ...aiContextManagementContributions,
  ...duoAccessContributions,
  ...telemetryContributions,
  ...configurationValidationContributions,
  ...connectionHandlersContributions,
  ...preProcessorContributions,
  ConfigLogLevelProvider,
  DefaultLogger,
  DefaultConfigService,
  DefaultConnectionDetailsService,
  DefaultDirectConnectionDetailsService,
  DefaultSupportedLanguagesService,
  GitLabAPI,
  ProxyGitLabApiService,
  DefaultFeatureFlagService,
  DefaultErrorHandler,
  DefaultOpenTabsService,
  DefaultDocumentTransformerService,
  DefaultSecretRedactor,
  GitleaksRuleParser,
  GitLeaksRuleEvaluator,
  DefaultPreProcessorPipeline,
  DefaultPostProcessorPipeline,
  DefaultUserService,
  DefaultIssueService,
  DefaultMergeRequestService,
  DefaultSystemContext,
  DefaultAuthContext,
  DefaultDidChangeConfigurationHandler,
  DefaultSleepDetectionService,
  DefaultErrorNotifier,
] as const;
