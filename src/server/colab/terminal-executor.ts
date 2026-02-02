/**
 * Copyright 2026 Satyam OP
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
import { convertProtocol } from '../../utils/extras';

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

  constructor(private readonly server: JupyterServer) {
    if (!server.connectionInformation) {
      throw new Error('TerminalExecutor: Connection info not found');
    }
    this.connectionInfo = server.connectionInformation;
    this.logger = logWithComponent('TerminalExecutor');
    this.setupRestClient();
    this.setupTerminalWs();

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

      this.terminalWs.send(this.buildCommand(cmd, args));

      // Can do better to parse the stream
      // for now lets just wait for some time and return success
      setTimeout(() => {
        resolve({
          success: true,
          output: '',
        });
      }, 2000);
    });
  }

  /**
   * Waits for the WebSocket connection to be ready.
   * @param timeout - Maximum time to wait in milliseconds
   */
  private async waitForConnection(timeout = 15000): Promise<void> {
    const startTime = Date.now();

    while (!this.terminalWs || this.terminalWs.readyState !== 1) {
      if (Date.now() - startTime > timeout) {
        throw new Error('Terminal WebSocket connection timeout');
      }

      if (this.terminalWs?.readyState === 3) {
        // Connection closed, try to reconnect
        this.logger.warn('WebSocket closed, attempting to reconnect...');
        this.setupTerminalWs();
        // Continue waiting for the new connection
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    this.logger.debug('WebSocket connection ready');
  }

  /**
   * Builds a JSON command string for the Colab terminal WebSocket.
   * @param cmd - The base command
   * @param args - Command arguments
   * @returns JSON-stringified command object
   */
  buildCommand(cmd: string, args: string[]): string {
    const data = [cmd, ...args, '\r'].join(' ');
    const colabCmd = { data };
    return JSON.stringify(colabCmd);
  }

  /**
   * Closes the terminal WebSocket connection.
   */
  closeTerminal() {
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
   * Sets up message, error, and close handlers.
   */
  setupTerminalWs() {
    const concWs = this.connectionInfo.WebSocket as typeof WebSocket;
    const wsBaseUrl = convertProtocol(this.connectionInfo.baseUrl.toString());
    this.logger.info(
      `Setting up terminal websocket with url: ${wsBaseUrl}${this.TERM_ENDPOINT}`,
    );
    const terminalSocket = new concWs(`${wsBaseUrl}${this.TERM_ENDPOINT}`);
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
        this.logger.info('Received valid terminal event:', validated.data);
      } else {
        this.logger.warn('Received invalid terminal event:', event.data);
      }
    };

    const errHandler = (event: ErrorEvent) => {
      this.logger.error('Terminal WebSocket error:', event.message);
    };

    const closeHandler = () => {
      this.logger.info('Terminal WebSocket connection closed');
      this.terminalWs = null;
    };
    terminalSocket.onclose = closeHandler;
    terminalSocket.onmessage = responseHandler;
    terminalSocket.onerror = errHandler;

    this.terminalWs = terminalSocket;
  }

  /**
   * Dispose of resources.
   */
  dispose(): void {
    // Close terminal if still open
    this.closeTerminal();
  }
}
