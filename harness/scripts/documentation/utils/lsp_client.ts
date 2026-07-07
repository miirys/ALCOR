import { spawn, ChildProcessWithoutNullStreams } from 'child_process';
import {
  createMessageConnection,
  StreamMessageReader,
  StreamMessageWriter,
} from 'vscode-jsonrpc/node';
import { MessageConnection } from 'vscode-jsonrpc';
import { Disposable } from '@gitlab-org/disposable';

/**
 * A client for interacting with the LSP server.
 * Manages the connection to a child process running the LSP server and handles
 * communication through JSON-RPC.
 *
 * NOTE: Bare minimum setup for generating documentation.
 *
 * @implements {Disposable}
 */
export class LspClient implements Disposable {
  #childProcess: ChildProcessWithoutNullStreams;

  #connection: MessageConnection;

  childProcessConsole: string[] = [];

  /**
   * Spawn language server and create an RPC connection.
   */
  constructor() {
    const command = process.env.LSP_COMMAND ?? 'node';
    const args = process.env.LSP_ARGS?.split(' ') ?? ['./out/main-bundle-node.js', '--stdio'];
    console.log(`Running LSP using command \`${command} ${args.join(' ')}\` `);

    this.#childProcess = spawn(command, args);
    this.#childProcess.stderr.on('data', (chunk: Buffer | string) => {
      const chunkString = chunk.toString('utf8');
      this.childProcessConsole = this.childProcessConsole.concat(chunkString.split('\n'));
      process.stderr.write(chunk);
    });

    // Use stdin and stdout for communication:
    this.#connection = createMessageConnection(
      new StreamMessageReader(this.#childProcess.stdout),
      new StreamMessageWriter(this.#childProcess.stdin),
    );

    this.#connection.listen();
    this.#connection.onError(function (err) {
      console.error(err);
    });
  }

  get connection() {
    return this.#connection;
  }

  dispose(): void {
    this.#connection.dispose();
    this.#childProcess.kill();
  }
}
