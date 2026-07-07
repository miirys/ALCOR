import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { ResultAsync, Result, okAsync, errAsync, ok, err } from 'neverthrow';
import { Service, ServiceLifetime } from '@gitlab/needle';
import * as yaml from 'js-yaml';
import { getDuoConfigDir } from '@gitlab-org/ai-configuration';
import { Flow, FlowId } from '../types';
import { conversionErrorToIssues, FlowValidationCode } from '../validation';
import { FlowStore, FlowStoreError } from './flow_store';
import { FlowResolver } from './resolver';
import { FLOW_V1_SCHEMA_VERSION } from './resolver/v1';

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [FlowResolver],
})
export class FileBasedFlowStore implements FlowStore {
  readonly #resolver: FlowResolver;

  readonly #baseDir: string;

  constructor(resolver: FlowResolver) {
    this.#resolver = resolver;
    const configDir = getDuoConfigDir();
    if (!configDir) {
      throw new Error('Could not determine config directory');
    }
    this.#baseDir = path.join(configDir, 'flows');
  }

  initialize(): ResultAsync<void, FlowStoreError> {
    return ResultAsync.fromPromise(
      fs.mkdir(this.#baseDir, { recursive: true }),
      (error): FlowStoreError => ({
        type: 'io_error',
        message: `Failed to create flows directory: ${error}`,
      }),
    ).map(() => undefined);
  }

  loadFlow(uri: string): ResultAsync<Flow, FlowStoreError> {
    return this.#resolveUriToPath(uri)
      .asyncAndThen((targetPath) => {
        return ResultAsync.fromPromise(
          fs.readFile(targetPath, 'utf-8'),
          (error: unknown): FlowStoreError => {
            if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
              return { type: 'not_found', flowId: uri as FlowId };
            }
            return {
              type: 'io_error',
              message: `Failed to read flow file: ${error instanceof Error ? error.message : String(error)}`,
            };
          },
        );
      })
      .andThen((content) => {
        // Use fromThrowable to safely parse YAML
        const safeYamlParse = Result.fromThrowable(
          () => yaml.load(content) as unknown,
          (error): FlowStoreError => ({
            type: 'invalid_format',
            message: 'Invalid YAML format',
            details: [error instanceof Error ? error.message : String(error)],
          }),
        );
        return safeYamlParse();
      })
      .andThen((data) =>
        this.#resolver.toFlow(data).mapErr(
          (conversionError): FlowStoreError => ({
            type: 'validation_error',
            issues: conversionErrorToIssues(conversionError),
          }),
        ),
      );
  }

  loadFlowYaml(uri: string): ResultAsync<string, FlowStoreError> {
    return this.#resolveUriToPath(uri).asyncAndThen((targetPath) => {
      return ResultAsync.fromPromise(
        fs.readFile(targetPath, 'utf-8'),
        (error: unknown): FlowStoreError => {
          if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
            return { type: 'not_found', flowId: uri as FlowId };
          }
          return {
            type: 'io_error',
            message: `Failed to read flow file: ${error instanceof Error ? error.message : String(error)}`,
          };
        },
      );
    });
  }

  saveFlow(flow: Flow, uri: string): ResultAsync<void, FlowStoreError> {
    // 1. Resolve URI to Path
    const pathResult = this.#resolveUriToPath(uri);
    if (pathResult.isErr()) return errAsync(pathResult.error);
    const targetPath = pathResult.value;

    return this.#resolver
      .fromFlow(flow, FLOW_V1_SCHEMA_VERSION)
      .mapErr(
        (conversionError): FlowStoreError => ({
          type: 'validation_error',
          issues: conversionErrorToIssues(conversionError),
        }),
      )
      .andThen((flowV1) => {
        // Use fromThrowable to safely serialize to YAML
        const safeYamlDump = Result.fromThrowable(
          () =>
            yaml.dump(flowV1, {
              indent: 2,
              lineWidth: 100,
              noRefs: true,
            }),
          (error): FlowStoreError => ({
            type: 'invalid_format',
            message: 'Failed to serialize to YAML',
            details: [error instanceof Error ? error.message : String(error)],
          }),
        );
        return safeYamlDump();
      })
      .asyncAndThen((yamlContent) =>
        ResultAsync.fromPromise(
          fs.writeFile(targetPath, yamlContent, 'utf-8'),
          (error): FlowStoreError => ({
            type: 'io_error',
            message: `Failed to write flow file: ${error instanceof Error ? error.message : String(error)}`,
          }),
        ),
      );
  }

  listFlows(): ResultAsync<Flow[], FlowStoreError> {
    // For v1, return single flow or empty array
    return this.loadFlow('default' as FlowId)
      .map((flow) => [flow])
      .orElse((error) => {
        if (error.type === 'not_found') {
          return okAsync([] as Flow[]);
        }

        return errAsync(error);
      });
  }

  #resolveUriToPath(uriString: string): Result<string, FlowStoreError> {
    try {
      const url = new URL(uriString);

      // Case 1: Local File System (file:///path/to/flow.yml)
      if (url.protocol === 'file:') {
        return ok(fileURLToPath(url));
      }

      // Case 2: Internal Registry (flow://default)
      if (url.protocol === 'flow:') {
        const name = url.hostname; // 'default', 'custom-flow', etc.
        // Map 'default' to 'workflow.yml' for backward compatibility, else use name.yml
        const filename = name === 'default' ? 'workflow.yml' : `${name}.yml`;
        return ok(path.join(this.#baseDir, filename));
      }

      return err({
        type: 'validation_error',
        issues: [
          {
            severity: 'error',
            code: FlowValidationCode.Uri,
            message: `Unsupported protocol: ${url.protocol}`,
          },
        ],
      });
    } catch {
      return err({
        type: 'validation_error',
        issues: [
          {
            severity: 'error',
            code: FlowValidationCode.Uri,
            message: `Invalid URI: ${uriString}`,
          },
        ],
      });
    }
  }
}
