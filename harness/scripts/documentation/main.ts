/* eslint-disable no-console */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'node:url';
import { DefaultRpcMessageSender, RpcMessageSender } from '@gitlab-org/rpc-client';
import { clientToServerMessages } from '@gitlab-org/documentation';
import { LspClient } from './utils/lsp_client';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = path.resolve(__dirname, '..', '..', 'docs', 'api');

/**
 * Main function to generate API documentation.
 * Establishes connection with the language server, retrieves schemas, and writes them to disk.
 */
async function main(): Promise<void> {
  const languageServer = new LspClient();
  let exitCode = 0;

  try {
    await ensureOutputDirectory();
    const messageSender = new DefaultRpcMessageSender(languageServer.connection, {
      getMessageDefinitions() {
        return Object.values(clientToServerMessages);
      },
    });
    console.log('Connected to the language server');

    const documents = await fetchDocumentation(messageSender);
    await writeDocumentationFiles(documents);

    console.log('Documentation generation completed successfully.');
  } catch (error) {
    console.error('Failed to generate documentation', error);
    exitCode = 1;
  } finally {
    languageServer.dispose();
  }

  process.exit(exitCode);
}

/**
 * Ensures the output directory exists.
 */
async function ensureOutputDirectory(): Promise<void> {
  try {
    await fs.mkdir(OUTPUT_PATH, { recursive: true });
  } catch (error) {
    throw new Error(
      `Failed to create output directory at ${OUTPUT_PATH}: ${error instanceof Error ? error.message : error}`,
    );
  }
}

/**
 * Fetches the documentation from the language server.
 * @param {RpcMessageSender} messageSender - The message sender instance.
 * @returns {Promise<Array<{ fileName: string; content: string }>>} - The documentation files.
 */
async function fetchDocumentation(
  messageSender: RpcMessageSender,
): Promise<Array<{ fileName: string; content: string }>> {
  try {
    const [clientToServerOpenApiSchema, serverToClientOpenApiSchema, swaggerDocument] =
      await Promise.all([
        messageSender.send(clientToServerMessages.getOpenApiSchema, {
          schemaType: 'client-to-server',
        }),
        messageSender.send(clientToServerMessages.getOpenApiSchema, {
          schemaType: 'server-to-client',
        }),
        messageSender.send(clientToServerMessages.getSwaggerDocument),
      ]);

    return [
      {
        fileName: 'client-to-server.schema.json',
        content: JSON.stringify(clientToServerOpenApiSchema, null, 2),
      },
      {
        fileName: 'server-to-client.schema.json',
        content: JSON.stringify(serverToClientOpenApiSchema, null, 2),
      },
      {
        fileName: 'swagger.html',
        content: swaggerDocument,
      },
    ];
  } catch (error) {
    throw new Error(
      `Failed to fetch documentation: ${error instanceof Error ? error.message : error}`,
    );
  }
}

/**
 * Writes the documentation files to disk.
 * @param {Array<{ fileName: string; content: string }>} files - The files to be written.
 */
async function writeDocumentationFiles(
  files: Array<{ fileName: string; content: string }>,
): Promise<void> {
  try {
    await Promise.all(
      files.map(async ({ fileName, content }) => {
        const filePath = path.resolve(OUTPUT_PATH, fileName);
        const normalizedPath = path.normalize(filePath);

        if (!normalizedPath.startsWith(OUTPUT_PATH)) {
          throw new Error('Security Check: Output path is not within expected directory');
        }

        await fs.writeFile(filePath, content, 'utf8');
      }),
    );
  } catch (error) {
    throw new Error(
      `Failed to write documentation files: ${error instanceof Error ? error.message : error}`,
    );
  }
}

main().catch(console.error);
