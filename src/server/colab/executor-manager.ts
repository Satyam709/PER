/**
 * Copyright 2026 Satyam OP
 *
 * Licensed under the Apache License, Version 2.0
 */

import { JupyterServer } from '@vscode/jupyter-extension';
import { Disposable } from 'vscode';
import { CommandExecutor } from '../../common/command-executor';
import { Logger, logWithComponent } from '../../common/logging';
import { TerminalExecutor } from './terminal-executor';

/**
 * Manages the lifecycle of command executors for Jupyter servers.
 * 
 * Ensures that:
 * - Each server has at most one executor instance
 * - Executors are properly disposed when servers are disconnected
 * - Executors are recreated when servers are reconnected
 */
export class ExecutorManager implements Disposable {
  private readonly executors = new Map<string, CommandExecutor>();
  private readonly logger: Logger;

  constructor() {
    this.logger = logWithComponent('ExecutorManager');
  }

  /**
   * Gets or creates an executor for the given server.
   * 
   * @param server - The Jupyter server to get an executor for
   * @returns The command executor for the server
   */
  getOrCreateExecutor(server: JupyterServer): CommandExecutor {
    const serverId = server.id;

    // Return existing executor if available
    const existing = this.executors.get(serverId);
    if (existing) {
      this.logger.debug(`Using existing executor for server: ${serverId}`);
      return existing;
    }

    // Create new executor
    this.logger.info(`Creating new executor for server: ${serverId}`);
    try {
      const executor = new TerminalExecutor(server);
      this.executors.set(serverId, executor);
      return executor;
    } catch (error) {
      this.logger.error(`Failed to create executor for server ${serverId}:`, error);
      throw error;
    }
  }

  /**
   * Gets an existing executor for the given server ID.
   * 
   * @param serverId - The server ID
   * @returns The executor if it exists, undefined otherwise
   */
  getExecutor(serverId: string): CommandExecutor | undefined {
    return this.executors.get(serverId);
  }

  /**
   * Removes and disposes the executor for the given server.
   * 
   * @param serverId - The ID of the server whose executor should be removed
   */
  removeExecutor(serverId: string): void {
    const executor = this.executors.get(serverId);
    if (executor) {
      this.logger.info(`Disposing executor for server: ${serverId}`);
      try {
        executor.dispose();
      } catch (error) {
        this.logger.error(`Error disposing executor for server ${serverId}:`, error);
      }
      this.executors.delete(serverId);
    }
  }

  /**
   * Checks if an executor exists for the given server.
   * 
   * @param serverId - The server ID to check
   * @returns True if an executor exists, false otherwise
   */
  hasExecutor(serverId: string): boolean {
    return this.executors.has(serverId);
  }

  /**
   * Gets the number of active executors.
   * 
   * @returns The count of active executors
   */
  getExecutorCount(): number {
    return this.executors.size;
  }

  /**
   * Disposes all executors and clears the registry.
   */
  dispose(): void {
    this.logger.info(`Disposing all executors (${String(this.executors.size)} active)`);
    for (const [serverId, executor] of this.executors.entries()) {
      try {
        this.logger.debug(`Disposing executor for server: ${serverId}`);
        executor.dispose();
      } catch (error) {
        this.logger.error(`Error disposing executor for server ${serverId}:`, error);
      }
    }
    this.executors.clear();
  }
}