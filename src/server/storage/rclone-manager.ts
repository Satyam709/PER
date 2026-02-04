/**
 * @license
 * Copyright 2026 Satyam
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Structure of a parsed rclone remote configuration.
 */
export interface RcloneRemote {
  name: string;
  type: string;
  config: Record<string, string>;
}

/**
 * Manages rclone configuration files and operations.
 *
 * Handles reading, parsing, validating, and encoding rclone configuration
 * for transmission to Jupyter servers.
 */
export class RcloneManager {
  /**
   * Read and parse an rclone configuration file.
   *
   * @param configPath - Path to the rclone configuration file.
   * @returns Parsed remotes from the config file.
   */
  async readConfig(configPath: string): Promise<RcloneRemote[]> {
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return this.parseConfig(content);
    } catch (error) {
      if (error instanceof Error) {
        throw new Error(`Failed to read rclone config: ${error.message}`);
      }
      throw error;
    }
  }

  /**
   * Parse rclone configuration content.
   *
   * Rclone configs are in INI format:
   * [remote_name]
   * type = drive
   * client_id = ...
   *
   * @param content - The rclone config file content.
   * @returns Array of parsed remotes.
   */
  parseConfig(content: string): RcloneRemote[] {
    const remotes: RcloneRemote[] = [];
    const lines = content.split('\n');

    let currentRemote: RcloneRemote | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith(';')) {
        continue;
      }

      // Check for section header [remote_name]
      const sectionRegex = /^\[([^\]]+)\]$/;
      const sectionMatch = sectionRegex.exec(trimmed);
      if (sectionMatch) {
        // Save previous remote if exists
        if (currentRemote) {
          remotes.push(currentRemote);
        }
        // Start new remote
        currentRemote = {
          name: sectionMatch[1],
          type: '',
          config: {},
        };
        continue;
      }

      // Parse key = value
      const kvRegex = /^([^=]+)=(.*)$/;
      const kvMatch = kvRegex.exec(trimmed);
      if (kvMatch && currentRemote) {
        const key = kvMatch[1].trim();
        const value = kvMatch[2].trim();

        if (key === 'type') {
          currentRemote.type = value;
        }
        currentRemote.config[key] = value;
      }
    }

    // Don't forget to add the last remote
    if (currentRemote) {
      remotes.push(currentRemote);
    }

    return remotes;
  }

  /**
   * Extract remote names from configuration.
   *
   * @param configPath - Path to the rclone configuration file.
   * @returns Array of remote names.
   */
  async getRemoteNames(configPath: string): Promise<string[]> {
    const remotes = await this.readConfig(configPath);
    return remotes.map((r) => r.name);
  }

  /**
   * Validate rclone configuration.
   *
   * @param configPath - Path to the rclone configuration file.
   * @returns Validation result with error message if invalid.
   */
  async validateConfig(
    configPath: string,
  ): Promise<{ valid: boolean; error?: string }> {
    try {
      // Check if file exists
      await fs.access(configPath);

      // Try to parse the config
      const remotes = await this.readConfig(configPath);

      // Check if at least one remote is configured
      if (remotes.length === 0) {
        return {
          valid: false,
          error: 'No remotes configured in rclone config file',
        };
      }

      // Validate each remote has a type
      for (const remote of remotes) {
        if (!remote.type) {
          return {
            valid: false,
            error: `Remote "${remote.name}" has no type specified`,
          };
        }
      }

      return { valid: true };
    } catch (error) {
      if (error instanceof Error) {
        return {
          valid: false,
          error: error.message,
        };
      }
      return {
        valid: false,
        error: 'Unknown error validating rclone config',
      };
    }
  }

  /**
   * Encode rclone configuration for transmission to server.
   *
   * Reads the config file and encodes it as base64 for safe transmission.
   *
   * @param configPath - Path to the rclone configuration file.
   * @returns Base64 encoded configuration.
   */
  async encodeConfigForTransmission(configPath: string): Promise<string> {
    const content = await fs.readFile(configPath, 'utf-8');
    return Buffer.from(content).toString('base64');
  }

  /**
   * Validate remote path format.
   *
   * @param remotePath - The remote path to validate (e.g., "drive:/projects/proj1").
   * @param configPath - Path to rclone config to verify remote exists.
   * @returns Validation result.
   */
  async validateRemotePath(
    remotePath: string,
    configPath: string,
  ): Promise<{ valid: boolean; error?: string }> {
    // Check format: remote:path
    const pathRegex = /^([^:]+):(.+)$/;
    const match = pathRegex.exec(remotePath);
    if (!match) {
      return {
        valid: false,
        error: 'Remote path must be in format "remote:/path/to/folder"',
      };
    }

    const remoteName = match[1];
    const path = match[2];

    // Verify the remote exists in the config
    try {
      const remoteNames = await this.getRemoteNames(configPath);
      if (!remoteNames.includes(remoteName)) {
        return {
          valid: false,
          error: `Remote "${remoteName}" not found in rclone config. Available remotes: ${remoteNames.join(', ')}`,
        };
      }
    } catch (error) {
      return {
        valid: false,
        error: `Failed to validate remote: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }

    // Basic path validation
    if (!path || path === '/') {
      return {
        valid: false,
        error: 'Path cannot be empty or root directory',
      };
    }

    return { valid: true };
  }

  /**
   * Get the default rclone config path for the current platform.
   *
   * @returns The default rclone config path.
   */
  getDefaultConfigPath(): string {
    const homeDir = process.env.HOME ?? process.env.USERPROFILE ?? '';

    if (process.platform === 'win32') {
      return path.join(homeDir, 'AppData', 'Roaming', 'rclone', 'rclone.conf');
    }

    // Linux and macOS
    const xdgConfigHome = process.env.XDG_CONFIG_HOME;
    if (xdgConfigHome) {
      return path.join(xdgConfigHome, 'rclone', 'rclone.conf');
    }

    return path.join(homeDir, '.config', 'rclone', 'rclone.conf');
  }

  /**
   * Check if the default rclone config exists.
   *
   * @returns True if the default config exists, false otherwise.
   */
  async hasDefaultConfig(): Promise<boolean> {
    try {
      const defaultPath = this.getDefaultConfigPath();
      await fs.access(defaultPath);
      return true;
    } catch {
      return false;
    }
  }
}
