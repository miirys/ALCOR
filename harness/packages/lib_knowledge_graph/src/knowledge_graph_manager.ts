import { ChildProcess, spawn } from 'child_process';
import { EventEmitter } from 'events';
import { Logger } from '@gitlab-org/logging';
import { createInterfaceId, Injectable } from '@gitlab/needle';
import { z } from 'zod';
import { getDuoConfigFilePath } from '@gitlab-org/ai-configuration';
import { IKnowledgeGraphConfig } from '@gitlab-org/config';
import { LocalKnowledgeGraphClient, KnowledgeGraphClient } from './knowledge_graph_client';

export interface KnowledgeGraphServerStartedEvent {
  url: URL;
}

export interface KnowledgeGraphManager {
  startServer(config: IKnowledgeGraphConfig | undefined): Promise<boolean>;
  getClient(): KnowledgeGraphClient | undefined;
  getUrl(): URL | undefined;
  onServerStarted(listener: (event: KnowledgeGraphServerStartedEvent) => void): void;
}

const startServerOutput = z.object({ port: z.number() });

export const KnowledgeGraphManager =
  createInterfaceId<KnowledgeGraphManager>('KnowledgeGraphManager');

@Injectable(KnowledgeGraphManager, [Logger])
export class DefaultKnowledgeGraphManager implements KnowledgeGraphManager {
  #logger: Logger;

  #url: URL | undefined = undefined;

  #eventEmitter = new EventEmitter();

  constructor(logger: Logger) {
    this.#logger = logger;
  }

  async startServer(config: IKnowledgeGraphConfig | undefined): Promise<boolean> {
    if (this.#url) {
      this.#logger.debug(`Knowledge Graph server already started at URL ${this.#url.toString()}.`);
      return true;
    }

    return new Promise<boolean>((resolve, reject) => {
      const mcpConfigPath = getDuoConfigFilePath('mcp.json');
      let childProcess: ChildProcess;

      const binaryPath = config?.binaryPath || 'gkg';
      if (mcpConfigPath) {
        childProcess = spawn(binaryPath, ['server', 'start', '--register-mcp', mcpConfigPath], {
          detached: true,
        });
      } else {
        childProcess = spawn(binaryPath, ['server', 'start'], { detached: true });
      }

      childProcess.stdout?.on('data', (data: unknown) => {
        let jsonData: unknown;

        try {
          const dataString = data instanceof Buffer ? data.toString() : String(data);
          jsonData = JSON.parse(dataString);
        } catch (error) {
          this.#logger.error(
            `Failed to parse Knowledge Graph server output as JSON. Received: ${data}. Error: ${error}.`,
          );

          this.#redirectStdLogsToLogger(childProcess);

          reject(error);
          return;
        }

        const parsedData = startServerOutput.safeParse(jsonData);
        if (!parsedData.success) {
          this.#logger.error(
            `Knowledge Graph server output is not a valid object. Received: ${data}. Error: ${parsedData.error.message}.`,
          );

          reject(parsedData.error);
          return;
        }

        this.#url = new URL(`http://localhost:${parsedData.data.port}`);
        this.#logger.info(`Knowledge Graph server started at URL ${this.#url}.`);
        this.#eventEmitter.emit('knowledge-graph:started', { url: this.#url });

        resolve(true);
      });

      childProcess.on('error', (error) => {
        if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
          this.#logger.warn(
            'Knowledge Graph binary (gkg) not found. Please ensure the Knowledge Graph binary is installed and available in your PATH.',
          );
          resolve(false);
          return;
        }

        this.#logger.error(`Failed to start Knowledge Graph server: ${error.message}.`);
        this.#redirectStdLogsToLogger(childProcess);

        reject(error);
      });

      childProcess.on('exit', (code) => {
        if (code !== 0) {
          const exitMessage = `Knowledge Graph server exited with code ${code}.`;
          this.#logger.error(exitMessage);

          this.#redirectStdLogsToLogger(childProcess);

          reject(new Error(exitMessage));
        }
      });
    });
  }

  getClient(): KnowledgeGraphClient | undefined {
    if (!this.#url) {
      return undefined;
    }

    return new LocalKnowledgeGraphClient(this.#logger, this.#url);
  }

  getUrl(): URL | undefined {
    return this.#url;
  }

  onServerStarted(listener: (event: KnowledgeGraphServerStartedEvent) => void): void {
    this.#eventEmitter.on('knowledge-graph:started', listener);
  }

  #redirectStdLogsToLogger(childProcess: ChildProcess) {
    this.#logger.info(`Knowledge Graph server STDOUT: ${childProcess.stdout?.read()}.`);
    this.#logger.info(`Knowledge Graph server STDERR: ${childProcess.stderr?.read()}.`);
  }
}
