/**
 * Copyright 2026 Satyam
 *
 * Licensed under the Apache License, Version 2.0
 */

import {
  JupyterServer,
  JupyterServerConnectionInformation,
} from '@vscode/jupyter-extension';
import { WebSocket, MessageEvent, ErrorEvent } from 'ws';
import z from 'zod';
import { Logger, logWithComponent } from '../../common/logging';
import { GeneralJupyterClient, JupyterClient } from '../../jupyter/client';
import { CommandExecutor, CommandResult } from '../../jupyter/servers';
import { convertProtocol, prettifyOutput } from '../../utils/extras';

/**
 * Executes commands on Jupyter server via Terminal API.
 *
 * Provides utilities for running shell commands, uploading scripts,
 * and managing terminal sessions on remote Jupyter servers.
 */

const ColabTerminalEvent = z.object({
  data: z.string(),
});
export type ColabTerminalEventType = z.infer<typeof ColabTerminalEvent>;

/**
 * CMD_TIMEOUT : timeout for the executing cmd
 */
const CMD_TIMEOUT = 10 * 60 * 1000; // 5 minutes
export class ColabTerminalExecutor implements CommandExecutor {
  // clients for communication with the server
  private terminalWs: WebSocket | null;
  private logger: Logger;
  private restClient: JupyterClient;

  private TERM_ENDPOINT = '/colab/tty';

  private connectionInfo: JupyterServerConnectionInformation;

  /**
   * The ID of the server this executor is connected to.
   */
  get serverId(): string {
    return this.server.id;
  }

  /**
   * Whether the WebSocket connection is currently open.
   */
  get isConnected(): boolean {
    return this.terminalWs?.readyState === 1; // WebSocket.OPEN = 1
  }

  constructor(private readonly server: JupyterServer) {
    if (!server.connectionInformation) {
      throw new Error('TerminalExecutor: Connection info not found');
    }
    this.connectionInfo = server.connectionInformation;
    this.logger = logWithComponent('TerminalExecutor');
    this.setupRestClient();
    // Auto-connect on construction
    void this.connect();

    this.logger.debug('created TerminalExecutor', {
      serverInfo: JSON.stringify(this.connectionInfo),
    });
  }

  /**
   * Executes a command on the Jupyter terminal.
   * @param cmd - The command to execute
   * @param args - Additional command arguments
   * @returns Promise resolving to command execution result
   */
  async execute(cmd: string, ...args: string[]): Promise<CommandResult> {
    // Wait for WebSocket to be ready
    await this.waitForConnection();
    let cmdOutput = '';

    return new Promise<CommandResult>((resolve, reject) => {
      if (!this.terminalWs) {
        reject(new Error('Terminal WebSocket not initialized'));
        return;
      }

      // Check WebSocket readyState
      if (this.terminalWs.readyState !== 1) {
        reject(
          new Error(
            `Terminal WebSocket not ready (state: ${String(this.terminalWs.readyState)})`,
          ),
        );
        return;
      }

      // auto fail on timeout
      setTimeout(() => {
        this.disconnect();
        reject(new Error('TIMEOUT: Cmd too long to complete!'));
      }, CMD_TIMEOUT);

      const outputResponseHandler = (event: MessageEvent) => {
        if (typeof event.data !== 'string') {
          this.logger.warn(
            'Received non-string terminal event data:',
            event.data,
          );
          return;
        }
        const validated = ColabTerminalEvent.safeParse(JSON.parse(event.data));
        if (!validated.success) {
          this.logger.warn('Received invalid terminal event:', event.data);
          return;
        }

        const chunk = prettifyOutput(validated.data.data);
        cmdOutput = cmdOutput.concat(chunk);

        // check marker
        const result = this.isCmdDone(chunk);
        if (result.complete) {
          const cmdResponse = {
            output: cmdOutput,
            success: result.exitCode == 0,
            exitCode: result.exitCode,
          };
          this.logger.debug(`execution done:\n${cmdResponse.output}`, {
            exitCode: result.exitCode,
          });
          resolve(cmdResponse);
        }
      };
      this.terminalWs.onmessage = outputResponseHandler;
      this.terminalWs.send(this.buildCommand(cmd, args));
      this.logger.debug('executing ' + this.buildCommand(cmd, args));
    });
  }

  /**
   * Checks if command execution is complete
   *  by looking for the completion marker.
   * @param output - The output string to check
   * @returns Object with completion status
   *  and exit code, or null if not complete
   */
  private isCmdDone(output: string): { complete: boolean; exitCode?: number } {
    const MARKER = '__CMD_COMPLETE__';
    const markerPattern = new RegExp(`${MARKER}:exit=(\\d+)`);
    const match = markerPattern.exec(output);
    if (match) {
      const exitCode = parseInt(match[1], 10);
      return { complete: true, exitCode };
    }

    return {
      complete: false,
    };
  }

  /**
   * Waits for the WebSocket connection to be ready.
   * @param timeout - Maximum time to wait in milliseconds
   */
  private async waitForConnection(timeout = 15000): Promise<void> {
    const start = Date.now();

    while (!this.isConnected) {
      if (Date.now() - start > timeout) {
        throw new Error('Terminal WebSocket connection timeout');
      }

      if (this.terminalWs?.readyState === 3) {
        this.logger.warn('WebSocket closed, attempting reconnect');

        try {
          await this.connect();
          this.logger.debug('reconnect success');
        } catch {
          this.logger.debug('reconnect failed');
        }
      }

      // a 200ms delay before evaluating again
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  /**
   * Builds a JSON command string for the Colab terminal WebSocket.
   * Adds a trap on exit to give a marker for the
   * downstream to look for command completion.
   * @param cmd - The base command
   * @param args - Command arguments
   * @returns JSON-stringified command object
   */
  private buildCommand(cmd: string, args: string[]): string {
    const command = [cmd, ...args].join(' ');
    const MARKER = '__CMD_COMPLETE__';

    const wrappedCmd = `( ${command} ); rc=$?; echo "${MARKER}:exit=$rc"\r`;

    return JSON.stringify({ data: wrappedCmd });
  }

  /**
   * Closes the WebSocket connection.
   * The connection can be re-established by calling connect().
   */
  disconnect(): void {
    if (this.terminalWs) {
      try {
        this.terminalWs.close();
      } catch (error) {
        this.logger.error('Failed to close terminal:', error);
      } finally {
        this.terminalWs = null;
      }
    }
  }

  /**
   * Sets up the REST client using Jupyter server connection information.
   */
  setupRestClient() {
    this.restClient = GeneralJupyterClient.withConnectionInfo(
      this.connectionInfo,
    );
    this.logger.debug(
      'Rest client for TerminalExecutor set up',
      'url:',
      this.connectionInfo,
    );
  }

  /**
   * Establishes WebSocket connection to the Jupyter terminal endpoint.
   * Can be called to reconnect after a disconnect.
   *
   * @returns Promise that resolves when the connection is established
   */
  async connect(): Promise<void> {
    if (this.isConnected) {
      this.logger.debug('Already connected, skipping connect()');
      return;
    }

    const concWs = this.connectionInfo.WebSocket as typeof WebSocket;
    const wsBaseUrl = convertProtocol(this.connectionInfo.baseUrl.toString());
    this.logger.info(
      `Setting up terminal websocket with url: ${wsBaseUrl}${this.TERM_ENDPOINT}`,
    );
    const terminalSocket = new concWs(`${wsBaseUrl}${this.TERM_ENDPOINT}`);
    this.terminalWs = terminalSocket;

    // Wait for connection to open
    return new Promise<void>((resolve, reject) => {
      terminalSocket.onopen = () => {
        this.logger.info('Terminal WebSocket connection opened');
        resolve();
      };

      terminalSocket.onerror = (event: ErrorEvent) => {
        this.logger.error('Terminal WebSocket error:', event.message);
        reject(new Error(`WebSocket connection failed: ${event.message}`));
      };
    });
  }

  assignDefaultHandlers() {
    const terminalSocket = this.terminalWs;
    if (!terminalSocket) {
      throw new Error('WS uninitialized');
    }
    /**
     * Handle the response which is of form
     * "\{"data":"..."\}"
     */
    const responseHandler = (event: MessageEvent) => {
      if (typeof event.data !== 'string') {
        this.logger.warn(
          'Received non-string terminal event data:',
          event.data,
        );
        return;
      }
      const validated = ColabTerminalEvent.safeParse(JSON.parse(event.data));
      if (validated.success) {
        this.logger.debug(
          'Received valid terminal event:',
          prettifyOutput(validated.data.data),
        );
      } else {
        this.logger.warn('Received invalid terminal event:', event.data);
      }
    };

    const closeHandler = () => {
      this.logger.info('Terminal WebSocket connection closed');
      this.terminalWs = null;
    };

    terminalSocket.onclose = closeHandler;
    terminalSocket.onmessage = responseHandler;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    // Close terminal if still open
    this.disconnect();
  }
}
