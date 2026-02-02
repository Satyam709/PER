/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { UUID } from 'crypto';
import {
  JupyterServer,
  JupyterServerConnectionInformation,
} from '@vscode/jupyter-extension';
import { CommandExecutor } from '../common/command-executor';
import { Variant, Shape } from '../server/colab/api';

/**
 * Provides on-demand terminal/command execution for a server.
 * Creates connection lazily on first use.
 */
export interface TerminalProvider {
  /**
   * Gets or creates a terminal connection for this server.
   * Creates connection on first call, reuses on subsequent calls.
   */
  getTerminal(): Promise<CommandExecutor>;

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
  readonly terminal: TerminalProvider;
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
