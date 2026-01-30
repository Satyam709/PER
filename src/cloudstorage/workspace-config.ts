/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode';

/**
 * Workspace-specific storage configuration.
 *
 * This is stored separately from the main storage config to allow
 * workspace-level protection and validation.
 */
export interface WorkspaceStorageConfig {
  /** The remote root path configured for this workspace */
  remoteRootPath: string;
  /** The workspace folder URI */
  workspaceUri: string;
  /** When this configuration was created */
  createdAt: Date;
}

/**
 * Manages workspace-specific storage configuration.
 *
 * Ensures that the correct remote folder is synced to the correct workspace,
 * preventing accidental sync of wrong directories.
 */
export class WorkspaceConfigManager {
  constructor(
    private readonly vs: typeof vscode,
    private readonly workspaceState: vscode.Memento,
  ) {}

  /**
   * Get the workspace configuration.
   *
   * @returns The workspace storage configuration if it exists.
   */
  get(): WorkspaceStorageConfig | undefined {
    const remoteRootPath = this.workspaceState.get<string>(
      'storage.remoteRootPath',
    );
    const workspaceUri = this.workspaceState.get<string>(
      'storage.workspaceUri',
    );
    const createdAt = this.workspaceState.get<string>('storage.createdAt');

    if (!remoteRootPath || !workspaceUri) {
      return undefined;
    }

    return {
      remoteRootPath,
      workspaceUri,
      createdAt: createdAt ? new Date(createdAt) : new Date(),
    };
  }

  /**
   * Save workspace configuration.
   *
   * @param config - The workspace storage configuration to save.
   */
  async save(config: WorkspaceStorageConfig): Promise<void> {
    await this.workspaceState.update(
      'storage.remoteRootPath',
      config.remoteRootPath,
    );
    await this.workspaceState.update(
      'storage.workspaceUri',
      config.workspaceUri,
    );
    await this.workspaceState.update(
      'storage.createdAt',
      config.createdAt.toISOString(),
    );
  }

  /**
   * Delete workspace configuration.
   */
  async delete(): Promise<void> {
    await this.workspaceState.update('storage.remoteRootPath', undefined);
    await this.workspaceState.update('storage.workspaceUri', undefined);
    await this.workspaceState.update('storage.createdAt', undefined);
  }

  /**
   * Validate that the workspace configuration matches the current workspace.
   *
   * @returns Validation result with any warnings.
   */
  validate(): {
    valid: boolean;
    warning?: string;
    currentWorkspaceUri?: string;
  } {
    const config = this.get();
    const currentWorkspaceUri = this.getCurrentWorkspaceUri();

    if (!currentWorkspaceUri) {
      return {
        valid: false,
        warning: 'No workspace is currently open',
      };
    }

    if (!config) {
      return { valid: true, currentWorkspaceUri };
    }

    if (config.workspaceUri !== currentWorkspaceUri) {
      return {
        valid: false,
        warning: `Storage is configured for a different workspace folder.\nConfigured: ${config.workspaceUri}\nCurrent: ${currentWorkspaceUri}`,
        currentWorkspaceUri,
      };
    }

    return { valid: true, currentWorkspaceUri };
  }

  /**
   * Get the current workspace URI.
   *
   * @returns The URI of the first workspace folder,
   *  or undefined if no workspace is open.
   */
  private getCurrentWorkspaceUri(): string | undefined {
    const workspaceFolders = this.vs.workspace.workspaceFolders;
    if (!workspaceFolders || workspaceFolders.length === 0) {
      return undefined;
    }
    return workspaceFolders[0].uri.toString();
  }

  /**
   * Check if the remote path has changed.
   *
   * @param newRemotePath - The new remote path to check.
   * @returns True if the path has changed, false otherwise.
   */
  hasRemotePathChanged(newRemotePath: string): boolean {
    const config = this.get();
    if (!config) {
      return false;
    }
    return config.remoteRootPath !== newRemotePath;
  }
}
