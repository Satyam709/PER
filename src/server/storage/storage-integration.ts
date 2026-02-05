/**
 * @license
 * Copyright 2026 Satyam
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode';
import { Logger, logWithComponent } from '../../common/logging';
import { CommandExecutor } from '../../jupyter/servers';
import { StorageConfigManager } from './config';
import { DEFAULT_LOCAL_PATH } from './constants';
import {
  installRclone,
  isRcloneInstalled,
  performBidirectionalSync,
  performInitialResync,
  uploadRcloneConfig,
  validateRcloneSetup,
} from './operations';
import { RcloneManager } from './rclone-manager';

/**
 * Status of storage setup on a server.
 *
 * - NOT_CONFIGURED: Workspace storage config not set (rclone path, remote)
 * - SETUP_REQUIRED: Workspace configured, but server needs setup
 *   (rclone not installed or config not uploaded)
 * - CHECKING: Validating storage setup on server
 * - INSTALLING: Installing rclone on server
 * - SYNCING: Sync operation in progress
 * - READY: Storage fully configured and ready
 * - ERROR: Setup or sync operation failed
 */
export enum StorageStatus {
  NOT_CONFIGURED = 'not_configured',
  SETUP_REQUIRED = 'setup_required',
  CHECKING = 'checking',
  INSTALLING = 'installing',
  SYNCING = 'syncing',
  READY = 'ready',
  ERROR = 'error',
}

/**
 * Result of storage setup operation.
 */
export interface StorageSetupResult {
  success: boolean;
  status: StorageStatus;
  message?: string;
  error?: string;
}

/**
 * Manages storage integration with Jupyter servers.
 *
 * Handles rclone installation, configuration, and synchronization
 * on remote servers.
 */
export class StorageIntegration {
  private readonly logger: Logger;
  private readonly rcloneManager: RcloneManager;
  private readonly serverSetupStatus = new Map<string, StorageStatus>();
  private readonly statusChangeEmitter: vscode.EventEmitter<{
    serverId: string;
    status: StorageStatus;
  }>;

  readonly onDidChangeStatus: vscode.Event<{
    serverId: string;
    status: StorageStatus;
  }>;

  constructor(
    private readonly vs: typeof vscode,
    private readonly storageConfigManager: StorageConfigManager,
  ) {
    this.logger = logWithComponent('StorageIntegration');
    this.rcloneManager = new RcloneManager();
    this.statusChangeEmitter = new vs.EventEmitter();
    this.onDidChangeStatus = this.statusChangeEmitter.event;
  }

  /**
   * Get the storage status for a server.
   */
  getStatus(serverId: string): StorageStatus {
    return this.serverSetupStatus.get(serverId) ?? StorageStatus.NOT_CONFIGURED;
  }

  /**
   * Check if storage is configured for the current workspace.
   */
  async isConfigured(): Promise<boolean> {
    return this.storageConfigManager.isConfigured();
  }

  /**
   * Check and initialize storage status for a server.
   *
   * Called when connecting to a server (e.g., on VS Code restart) to determine
   * the actual state of storage setup on the server. This fixes the issue where
   * the in-memory status map is empty after restart but the server may already
   * have rclone configured.
   *
   * @param executor - Command executor for the server
   * @returns Setup result with the determined status
   */
  async checkAndInitializeStatus(
    executor: CommandExecutor,
  ): Promise<StorageSetupResult> {
    const serverId = executor.serverId;
    this.logger.info(`Checking storage status on server: ${serverId}`);

    // If already checked or in a transient state, return current status
    const currentStatus = this.serverSetupStatus.get(serverId);
    if (
      currentStatus === StorageStatus.CHECKING ||
      currentStatus === StorageStatus.INSTALLING ||
      currentStatus === StorageStatus.SYNCING ||
      currentStatus === StorageStatus.READY
    ) {
      this.logger.debug(
        `Server ${serverId} already has status: ${currentStatus}, skipping check`,
      );
      return {
        success: currentStatus === StorageStatus.READY,
        status: currentStatus,
      };
    }

    this.updateStatus(serverId, StorageStatus.CHECKING);

    try {
      // Check if storage is configured in workspace
      const config = await this.storageConfigManager.get();
      if (!config?.enabled) {
        this.logger.debug('Storage not enabled in workspace config');
        this.updateStatus(serverId, StorageStatus.NOT_CONFIGURED);
        return {
          success: false,
          status: StorageStatus.NOT_CONFIGURED,
          message: 'Storage not configured',
        };
      }

      // Validate rclone setup on server
      const validation = await validateRcloneSetup(executor);

      if (validation.valid) {
        this.logger.info(`Storage is ready on server ${serverId}`);
        this.updateStatus(serverId, StorageStatus.READY);
        return {
          success: true,
          status: StorageStatus.READY,
          message: validation.message,
        };
      } else {
        this.logger.info(
          `Storage not setup on server ${serverId}: ${validation.message}`,
        );
        this.updateStatus(serverId, StorageStatus.SETUP_REQUIRED);
        return {
          success: false,
          status: StorageStatus.SETUP_REQUIRED,
          message: validation.message,
        };
      }
    } catch (error) {
      this.logger.error(`Error checking storage status on ${serverId}:`, error);
      this.updateStatus(serverId, StorageStatus.ERROR);
      return {
        success: false,
        status: StorageStatus.ERROR,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Setup storage on a server.
   *
   * @param executor - Command executor for the server (carries serverId)
   * @returns Setup result
   */
  async setupOnServer(executor: CommandExecutor): Promise<StorageSetupResult> {
    const serverId = executor.serverId;
    this.logger.info(`Setting up storage on server: ${serverId}`);

    try {
      // Check if storage is configured
      const config = await this.storageConfigManager.get();
      if (!config?.enabled) {
        this.logger.info('Storage not configured, skipping setup');
        this.updateStatus(serverId, StorageStatus.NOT_CONFIGURED);
        return {
          success: false,
          status: StorageStatus.NOT_CONFIGURED,
          message: 'Storage not configured',
        };
      }

      // Validate workspace
      const workspaceError =
        await this.storageConfigManager.validateWorkspace();
      if (workspaceError) {
        this.logger.warn(`Workspace validation failed: ${workspaceError}`);
        this.updateStatus(serverId, StorageStatus.ERROR);
        return {
          success: false,
          status: StorageStatus.ERROR,
          error: workspaceError,
        };
      }

      // Check if already setup
      this.updateStatus(serverId, StorageStatus.CHECKING);
      const isAlreadySetup = await this.checkIfSetup(executor);
      if (isAlreadySetup) {
        this.logger.info('Storage already setup on server');
        this.updateStatus(serverId, StorageStatus.READY);
        return {
          success: true,
          status: StorageStatus.READY,
          message: 'Storage already configured',
        };
      }

      // Install rclone
      this.updateStatus(serverId, StorageStatus.INSTALLING);
      await this.installRcloneOnServer(executor);

      // Upload rclone config
      if (!config.rcloneConfigContent) {
        throw new Error('Rclone config content is missing');
      }
      await this.uploadRcloneConfigToServer(
        executor,
        config.rcloneConfigContent,
      );

      // Initial sync
      this.updateStatus(serverId, StorageStatus.SYNCING);
      await this.performInitialSyncOperation(executor, config.remoteRootPath);

      this.updateStatus(serverId, StorageStatus.READY);
      this.logger.info('Storage setup completed successfully');

      return {
        success: true,
        status: StorageStatus.READY,
        message: 'Storage configured successfully',
      };
    } catch (error) {
      this.logger.error(`Storage setup failed on server ${serverId}:`, error);
      this.updateStatus(serverId, StorageStatus.ERROR);
      return {
        success: false,
        status: StorageStatus.ERROR,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Perform a manual sync on a server.
   */
  async syncNow(executor: CommandExecutor): Promise<StorageSetupResult> {
    const serverId = executor.serverId;
    this.logger.info(`Manual sync requested for server: ${serverId}`);

    try {
      const config = await this.storageConfigManager.get();
      if (!config?.enabled) {
        return {
          success: false,
          status: StorageStatus.NOT_CONFIGURED,
          message: 'Storage not configured',
        };
      }

      const currentStatus = this.getStatus(serverId);
      if (currentStatus !== StorageStatus.READY) {
        return {
          success: false,
          status: currentStatus,
          message: 'Storage not ready for sync',
        };
      }

      this.updateStatus(serverId, StorageStatus.SYNCING);

      // Perform bidirectional sync
      const localPath = this.getLocalPath(serverId);
      this.logger.debug('Executing bidirectional sync', {
        remotePath: config.remoteRootPath,
        localPath,
      });
      const result = await performBidirectionalSync(executor, {
        remotePath: config.remoteRootPath,
        localPath,
        verbose: true,
      });

      if (!result.success) {
        const errorMsg = result.error ?? 'Sync failed';
        this.logger.error('Bidirectional sync failed', {
          exitCode: result.exitCode,
          error: result.error,
          output: result.output,
        });
        throw new Error(`Sync failed: ${errorMsg}`);
      }

      this.logger.info('Bidirectional sync completed successfully', {
        exitCode: result.exitCode,
      });
      this.logger.debug('Sync output', {
        output: result.output,
      });

      this.updateStatus(serverId, StorageStatus.READY);

      // Update last sync timestamp
      await this.storageConfigManager.update({
        lastSync: new Date(),
      });

      this.logger.info('Manual sync completed successfully');

      return {
        success: true,
        status: StorageStatus.READY,
        message: 'Sync completed successfully',
      };
    } catch (error) {
      this.logger.error(`Sync failed on server ${serverId}:`, error);
      this.updateStatus(serverId, StorageStatus.ERROR);
      return {
        success: false,
        status: StorageStatus.ERROR,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Validate storage setup on a server.
   *
   * Updates the server status map to reflect the validation result,
   * so the status bar correctly shows the current state.
   */
  async validateSetup(executor: CommandExecutor): Promise<StorageSetupResult> {
    const serverId = executor.serverId;
    try {
      const config = await this.storageConfigManager.get();

      if (!config?.enabled) {
        this.updateStatus(serverId, StorageStatus.NOT_CONFIGURED);
        return {
          success: false,
          status: StorageStatus.NOT_CONFIGURED,
          message: 'Storage not configured in workspace',
        };
      }

      // Validate rclone setup using atomic operations
      const validation = await validateRcloneSetup(executor);

      if (!validation.valid) {
        this.updateStatus(serverId, StorageStatus.SETUP_REQUIRED);
        return {
          success: false,
          status: StorageStatus.SETUP_REQUIRED,
          message: validation.message,
        };
      }

      this.updateStatus(serverId, StorageStatus.READY);
      return {
        success: true,
        status: StorageStatus.READY,
        message: validation.message,
      };
    } catch (error) {
      this.updateStatus(serverId, StorageStatus.ERROR);
      return {
        success: false,
        status: StorageStatus.ERROR,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Setup automatic sync cron job on a server.
   * TODO : fix this
   */
  // async setupCronJob(executor: CommandExecutor): Promise<StorageSetupResult> {

  // }

  /**
   * Get workspace-specific local path for a server.
   * Each workspace gets its own directory to avoid conflicts.
   */
  private getLocalPath(serverId: string): string {
    // Use server ID to create unique path
    const sanitizedId = serverId.replace(/[^a-zA-Z0-9-]/g, '_');
    return `${DEFAULT_LOCAL_PATH}_${sanitizedId}`;
  }

  /**
   * Clean up storage for a removed server.
   */
  removeServer(serverId: string): void {
    this.serverSetupStatus.delete(serverId);
    this.logger.debug(`Removed storage status for server: ${serverId}`);
  }

  /**
   * Check if rclone is installed and configured on the server.
   */
  private async checkIfSetup(executor: CommandExecutor): Promise<boolean> {
    return await isRcloneInstalled(executor);
  }

  /**
   * Install rclone on the server.
   */
  private async installRcloneOnServer(
    executor: CommandExecutor,
  ): Promise<void> {
    this.logger.info('Installing rclone on server...');

    const result = await installRclone(executor);

    if (!result.success) {
      const errorMsg = result.error ?? 'Installation failed';
      this.logger.error('Rclone installation failed', {
        exitCode: result.exitCode,
        error: result.error,
        output: result.output,
      });
      throw new Error(`Rclone installation failed: ${errorMsg}`);
    }

    this.logger.info('Rclone installation completed successfully', {
      exitCode: result.exitCode,
    });
    this.logger.debug('Rclone installation output', {
      output: result.output,
    });
  }

  /**
   * Upload rclone configuration to the server.
   */
  private async uploadRcloneConfigToServer(
    executor: CommandExecutor,
    configContent: string,
  ): Promise<void> {
    const serverId = executor.serverId;
    this.logger.info('Uploading rclone configuration...');

    // Update status to show we're in the config upload phase
    this.updateStatus(serverId, StorageStatus.INSTALLING);

    const result = await uploadRcloneConfig(executor, configContent);

    if (!result.success) {
      const errorMsg = result.error ?? 'Config upload failed';
      this.logger.error('Rclone config upload failed', {
        exitCode: result.exitCode,
        error: result.error,
        output: result.output,
      });
      throw new Error(`Rclone config upload failed: ${errorMsg}`);
    }

    this.logger.info('Rclone configuration uploaded successfully', {
      exitCode: result.exitCode,
    });
    this.logger.debug('Rclone config upload output', {
      output: result.output,
    });
  }

  /**
   * Perform initial sync.
   */
  private async performInitialSyncOperation(
    executor: CommandExecutor,
    remotePath: string,
  ): Promise<void> {
    this.logger.info('Performing initial sync...', {
      remotePath,
      localPath: this.getLocalPath(executor.serverId),
    });

    const localPath = this.getLocalPath(executor.serverId);
    const result = await performInitialResync(executor, {
      remotePath,
      localPath,
      verbose: true,
    });

    if (!result.success) {
      const errorMsg = result.error ?? 'Initial sync failed';
      this.logger.error('Initial sync failed', {
        exitCode: result.exitCode,
        error: result.error,
        output: result.output,
      });
      throw new Error(`Initial sync failed: ${errorMsg}`);
    }

    this.logger.info('Initial sync completed successfully', {
      exitCode: result.exitCode,
    });
    this.logger.debug('Initial sync output', {
      output: result.output,
    });
  }

  /**
   * Update status and fire event.
   */
  private updateStatus(serverId: string, status: StorageStatus): void {
    this.serverSetupStatus.set(serverId, status);
    this.statusChangeEmitter.fire({ serverId, status });
    this.logger.debug(`Storage status updated for ${serverId}: ${status}`);
  }

  dispose(): void {
    this.statusChangeEmitter.dispose();
  }
}
