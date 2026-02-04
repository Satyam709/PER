/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode';
import { Logger, logWithComponent } from '../../common/logging';
import { CommandExecutor } from '../../jupyter/servers';
import { StorageConfigManager } from './config';
import { RcloneManager } from './rclone-manager';
import {
  InstallRcloneScriptBuilder,
  UploadConfigScriptBuilder,
  SyncScriptBuilder,
  DEFAULT_LOCAL_PATH,
} from './scripts';

/**
 * Status of storage setup on a server.
 */
export enum StorageStatus {
  NOT_CONFIGURED = 'not_configured',
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
      await this.installRclone(executor);

      // Upload rclone config
      if (!config.rcloneConfigContent) {
        throw new Error('Rclone config content is missing');
      }
      await this.uploadRcloneConfig(executor, config.rcloneConfigContent);

      // Initial sync
      this.updateStatus(serverId, StorageStatus.SYNCING);
      await this.performInitialSync(executor, config.remoteRootPath);

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
      const builder = new SyncScriptBuilder({
        remotePath: config.remoteRootPath,
        localPath,
        verbose: true,
      });
      const syncScript = builder.buildBidirectional();

      await executor.execute(syncScript);

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
   */
  async validateSetup(executor: CommandExecutor): Promise<StorageSetupResult> {
    try {
      const isSetup = await this.checkIfSetup(executor);
      const config = await this.storageConfigManager.get();

      if (!isSetup) {
        return {
          success: false,
          status: StorageStatus.NOT_CONFIGURED,
          message: 'Rclone not installed on server',
        };
      }

      if (!config?.enabled) {
        return {
          success: false,
          status: StorageStatus.NOT_CONFIGURED,
          message: 'Storage not configured in workspace',
        };
      }

      // Check if config file exists on server
      const result = await executor.execute(
        'test -f ~/.config/rclone/rclone.conf && echo "exists" || echo "missing"',
      );

      if (result.output.trim() === 'missing') {
        return {
          success: false,
          status: StorageStatus.ERROR,
          message: 'Rclone config missing on server',
        };
      }

      return {
        success: true,
        status: StorageStatus.READY,
        message: 'Storage setup is valid',
      };
    } catch (error) {
      return {
        success: false,
        status: StorageStatus.ERROR,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Setup automatic sync cron job on a server.
   */
  async setupCronJob(executor: CommandExecutor): Promise<StorageSetupResult> {
    const serverId = executor.serverId;
    this.logger.info(`Setting up cron job for server: ${serverId}`);

    try {
      const config = await this.storageConfigManager.get();
      if (!config?.enabled) {
        return {
          success: false,
          status: StorageStatus.NOT_CONFIGURED,
          message: 'Storage not configured',
        };
      }

      // Lazy import to avoid unused import error
      const { CronJobScriptBuilder } = await import('./scripts/index.js');

      const builder = new CronJobScriptBuilder({
        remotePath: config.remoteRootPath,
        localPath: this.getLocalPath(serverId),
        verbose: false, // Less verbose for cron jobs
      });

      const cronScript = builder.build();
      await executor.execute(cronScript);

      this.logger.info('Cron job setup completed successfully');

      return {
        success: true,
        status: StorageStatus.READY,
        message: 'Cron job configured for automatic sync every 10 minutes',
      };
    } catch (error) {
      this.logger.error(`Cron job setup failed on server ${serverId}:`, error);
      return {
        success: false,
        status: StorageStatus.ERROR,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

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
    try {
      const result = await executor.execute('command -v rclone');
      return result.exitCode === 0;
    } catch {
      return false;
    }
  }

  /**
   * Install rclone on the server.
   */
  private async installRclone(executor: CommandExecutor): Promise<void> {
    this.logger.info('Installing rclone on server...');

    const builder = new InstallRcloneScriptBuilder();
    const installScript = builder.build();

    const result = await executor.execute(installScript);
    this.logger.info('Rclone installation completed', { result });
  }

  /**
   * Upload rclone configuration to the server.
   */
  private async uploadRcloneConfig(
    executor: CommandExecutor,
    configContent: string,
  ): Promise<void> {
    this.logger.info('Uploading rclone configuration...');

    const builder = new UploadConfigScriptBuilder({ configContent });
    const uploadScript = builder.build();

    await executor.execute(uploadScript);
    this.logger.info('Rclone configuration uploaded');
  }

  /**
   * Perform initial sync.
   */
  private async performInitialSync(
    executor: CommandExecutor,
    remotePath: string,
  ): Promise<void> {
    this.logger.info('Performing initial sync...');

    const localPath = this.getLocalPath(executor.serverId);
    const builder = new SyncScriptBuilder({
      remotePath,
      localPath,
      verbose: true,
    });
    const syncScript = builder.buildInitialResync();

    await executor.execute(syncScript);
    this.logger.info('Initial sync completed');
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
