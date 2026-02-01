/**
 * Copyright 2026 Satyam OP
 *
 * Licensed under the Apache License, Version 2.0
 */

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
