import { Result } from 'neverthrow';
import { Flow } from '../../types';
import { ConversionError } from './errors';

export interface FlowConverter {
  /**
   * Get the version this converter handles
   */
  readonly version: string;

  /**
   * Convert from GitLab Flow format to internal Flow representation
   */
  toFlow(data: unknown): Result<Flow, ConversionError>;

  /**
   * Convert from internal Flow representation to GitLab Flow format
   */
  fromFlow(flow: Flow): Result<unknown, ConversionError>;
}
