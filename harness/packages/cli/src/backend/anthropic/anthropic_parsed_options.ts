import { z } from 'zod';
import { createInterfaceId } from '@gitlab/needle';
import { zodShapeFromDefMap } from '../../option_def';
import { anthropicOptionDefs, SupportedAnthropicModel } from '../../backend_option_defs';

// 'branded' string type - prevents TypeScript's type widening logic, so specific model values are retained
export type AnthropicModel = SupportedAnthropicModel | (string & {});

const anthropicOptionSchema = z.object(zodShapeFromDefMap(anthropicOptionDefs));

export type AnthropicParsedOptions = z.infer<typeof anthropicOptionSchema>;
export const AnthropicParsedOptions =
  createInterfaceId<AnthropicParsedOptions>('AnthropicParsedOptions');

export { anthropicOptionSchema };
