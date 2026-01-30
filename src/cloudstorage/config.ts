/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode';
import { z } from 'zod';
import { PROVIDER_ID } from '../config/constants';

const STORAGE_CONFIG_KEY = `${PROVIDER_ID}.storage_config`;

/**
 * Zod schema for storage configuration validation.
 */
export const StorageConfigSchema = z.object({
  /** Path to the rclone configuration file */
  rcloneConfigPath: z.string().nonempty(),
  /** Remote root path (e.g., "drive:/projects/proj1") */
  remoteRootPath: z.string().nonempty(),
  /** Optional workspace identifier for linking config to workspace */
  workspaceId: z.string().optional(),
  /** Whether storage sync is enabled */
  enabled: z.boolean().default(true),
  /** Last successful sync timestamp */
  lastSync: z.coerce.date().optional(),
  /** Rclone config content (encrypted) */
  rcloneConfigContent: z.string().optional(),
});

/**
 * Storage configuration interface.
 */
export type StorageConfig = z.infer<typeof StorageConfigSchema>;

/**
 * Manages storage configuration for cloud storage synchronization.
 *
 * Stores sensitive rclone configuration in VSCode SecretStorage and
 * workspace-specific settings in workspace state.
 */
export class StorageConfigManager {
  constructor(
    private readonly vs: typeof vscode,
    private readonly secrets: vscode.SecretStorage,
    private readonly workspaceState: vscode.Memento,
  ) {}

  /**
   * Get the storage configuration for the current workspace.
   *
   * @returns The storage configuration if it exists, otherwise undefined.
   */
  async get(): Promise<StorageConfig | undefined> {
    const configJson = await this.secrets.get(STORAGE_CONFIG_KEY);
    if (!configJson) {
      return undefined;
    }

    try {
      return StorageConfigSchema.parse(configJson);
    } catch (error) {
      console.error('Failed to parse storage configuration:', error);
      return undefined;
    }
  }

  /**
   * Get storage configuration for a specific workspace.
   *
   * @param workspaceId - The workspace identifier.
   * @returns The storage configuration for the workspace if it exists.
   */
  async getForWorkspace(
    workspaceId: string,
  ): Promise<StorageConfig | undefined> {
    const config = await this.get();
    if (!config || config.workspaceId !== workspaceId) {
      return undefined;
    }
    return config;
  }

  /**
   * Save storage configuration.
   *
   * @param config - The storage configuration to save.
   */
  async save(config: StorageConfig): Promise<void> {
    // Validate the configuration
    const validated = StorageConfigSchema.parse(config);

    // Store in SecretStorage (contains sensitive rclone config)
    const configJson = JSON.stringify(validated);
    await this.secrets.store(STORAGE_CONFIG_KEY, configJson);

    // Also store workspace association in workspace state
    if (validated.workspaceId) {
      await this.workspaceState.update(
        'storage.workspaceId',
        validated.workspaceId,
      );
      await this.workspaceState.update(
        'storage.remoteRootPath',
        validated.remoteRootPath,
      );
    }
  }

  /**
   * Update storage configuration fields.
   *
   * @param updates - Partial configuration to update.
   */
  async update(updates: Partial<StorageConfig>): Promise<void> {
    const existing = await this.get();
    if (!existing) {
      throw new Error('No existing storage configuration to update');
    }

    const updated = { ...existing, ...updates };
    await this.save(updated);
  }

  /**
   * Delete storage configuration.
   */
  async delete(): Promise<void> {
    await this.secrets.delete(STORAGE_CONFIG_KEY);
    await this.workspaceState.update('storage.workspaceId', undefined);
    await this.workspaceState.update('storage.remoteRootPath', undefined);
  }

  /**
   * Check if storage is configured.
   *
   * @returns True if storage is configured, false otherwise.
   */
  async isConfigured(): Promise<boolean> {
    const config = await this.get();
    return config?.enabled ? true : false;
  }

  /**
   * Validate remote root path format.
   *
   * @param path - The remote path to validate.
   * @returns Error message if invalid, empty string if valid.
   */
  validateRemoteRootPath(path: string): string {
    // Remote path should be in format: "remote:path/to/folder"
    const remotePathPattern = /^[a-zA-Z0-9_-]+:.+$/;
    if (!remotePathPattern.test(path)) {
      return 'Remote path must be in format "remote:/path/to/folder"';
    }
    return '';
  }

  /**
   * Get the workspace ID for the current workspace.
   *
   * @returns The workspace ID if available, otherwise undefined.
   */
  getCurrentWorkspaceId(): string | undefined {
    const workspaceFolders = this.vs.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }
    // Use the first workspace folder's URI as the workspace ID
    return workspaceFolders[0].uri.toString();
  }

  /**
   * Validate that the current workspace matches the configured workspace.
   *
   * @returns Warning message if there's a mismatch, empty string if valid.
   */
  async validateWorkspace(): Promise<string> {
    const config = await this.get();
    if (!config?.workspaceId) {
      return '';
    }

    const currentWorkspaceId = this.getCurrentWorkspaceId();
    if (!currentWorkspaceId) {
      return 'No workspace is currently open';
    }

    if (config.workspaceId !== currentWorkspaceId) {
      return `Storage is configured for a different workspace. Current: ${currentWorkspaceId}, Configured: ${config.workspaceId}`;
    }

    return '';
  }
}
