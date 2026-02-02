/**
 * @license
 * Copyright 2025 Google LLC
 * Copyright 2026 Satyam
 * SPDX-License-Identifier: Apache-2.0
 */

import { UUID } from 'crypto';
import {
  JupyterServer,
  JupyterServerConnectionInformation,
} from '@vscode/jupyter-extension';
import { Variant, Shape } from '../server/colab/api';

/**
 * Result of a command execution.
 */
export interface CommandResult {
  /** Whether the command succeeded */
  success: boolean;
  /** Command output (stdout + stderr) */
  output: string;
  /** Exit code if available */
  exitCode?: number;
  /** Error message if failed */
  error?: string;
}

/**
 * Common interface for executing commands on remote servers.
 *
 * Implementations can target different backends such as:
 * - Colab terminal via WebSocket
 * - Custom instance SSH connections
 * - Other remote execution mechanisms
 */
export interface CommandExecutor {
  /**
   * The ID of the server this executor is connected to.
   * Used for status tracking and logging.
   */
  readonly serverId: string;

  /**
   * Whether the executor is currently connected.
   * Returns true if the underlying connection (e.g., WebSocket) is open.
   */
  readonly isConnected: boolean;

  /**
   * Establishes the connection to the remote server.
   * Can be called to reconnect after a disconnect.
   *
   * @returns Promise that resolves when the connection is established
   */
  connect(): Promise<void>;

  /**
   * Closes the connection to the remote server.
   * The connection can be re-established by calling connect().
   */
  disconnect(): void;

  /**
   * Executes the given command with optional arguments.
   *
   * @param cmd - Command to execute
   * @param args - Additional command arguments
   * @returns Promise resolving to the command execution result
   */
  execute(cmd: string, ...args: string[]): Promise<CommandResult>;

  /**
   * Dispose of resources and cleanup connections.
   * Should be called when the executor is no longer needed.
   */
  dispose(): void;
}

/**
 * Options for command execution.
 */
export interface ExecuteOptions {
  /** Timeout in milliseconds (default: 30000) */
  timeout?: number;
  /** Expected output pattern to wait for */
  expectedOutput?: RegExp;
  /** Whether to show output in real-time */
  streamOutput?: boolean;
}

/**
 * Provides on-demand terminal/command execution for a server.
 * Creates connection lazily on first use.
 */
export interface TerminalProvider {
  /**
   * Gets or creates a terminal connection for this server.
   * Creates connection on first call, reuses on subsequent calls.
   */
  getTerminal(): CommandExecutor;

  /**
   * Disposes the terminal connection if it exists.
   */
  disposeTerminal(): void;
}

/**
 * Colab's Jupyter server descriptor which includes machine-specific
 * designations.
 */
export interface ColabServerDescriptor {
  readonly label: string;
  readonly variant: Variant;
  readonly accelerator?: string;
  readonly shape?: Shape;
}

/**
 * A Jupyter server which includes the Colab descriptor and enforces that IDs
 * are UUIDs.
 */
export interface ColabJupyterServer
  extends ColabServerDescriptor,
    JupyterServer {
  readonly id: UUID;
}

/**
 * A Colab Jupyter server which has been assigned in and owned by VS Code, thus
 * including the required connection information.
 */
export type ColabAssignedServer = ColabJupyterServer & {
  readonly endpoint: string;
  readonly connectionInformation: JupyterServerConnectionInformation & {
    readonly token: string;
    readonly tokenExpiry: Date;
  };
  readonly dateAssigned: Date;
  /** On-demand terminal provider for executing commands on this server */
  readonly terminal?: TerminalProvider;
};

export function isColabAssignedServer(
  s: ColabAssignedServer | UnownedServer,
): s is ColabAssignedServer {
  return 'connectionInformation' in s;
}

export const DEFAULT_CPU_SERVER: ColabServerDescriptor = {
  label: 'Colab CPU',
  variant: Variant.DEFAULT,
};

/** A Colab server assigned outside and not owned by VS Code. */
export interface UnownedServer extends ColabServerDescriptor {
  readonly endpoint: string;
}

/** Consists of all servers that are assigned in and outside VS Code. */
export interface AllServers {
  /** Servers assigned in VS Code. */
  readonly assigned: readonly ColabAssignedServer[];

  /** Servers assigned outside and not owned by VS Code. */
  readonly unowned: readonly UnownedServer[];
}
