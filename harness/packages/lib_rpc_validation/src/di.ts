import { CompositeMessageValidationService } from './composite_message_validation_service';
import { DuplicateMethodValidator, NamingConventionValidator } from './validators';

export const messageValidationDiContributions = [
  CompositeMessageValidationService,
  DuplicateMethodValidator,
  NamingConventionValidator,
];
