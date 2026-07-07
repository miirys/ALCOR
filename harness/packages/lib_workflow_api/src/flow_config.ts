import * as yaml from 'js-yaml';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParsedFlowConfig = { [key: string]: any };

export function tryParseFlowConfig(flowConfig: string | undefined): ParsedFlowConfig | undefined {
  if (!flowConfig) {
    return undefined;
  }

  return yaml.load(flowConfig, {
    schema: yaml.JSON_SCHEMA,
  }) as ParsedFlowConfig;
}
