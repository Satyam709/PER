/**
 * @license
 * Copyright 2026 Satyam
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode';
import { NotebookServerTracker } from '../../jupyter/notebook-server-tracker';
import { StorageConfigManager } from './config';
import { StorageIntegration, StorageStatus } from './storage-integration';

/**
 * Manages the storage status bar item.
 *
 * Shows storage sync status and provides quick access to storage commands.
 */
export class StorageStatusBar implements vscode.Disposable {
  private readonly statusBarItem: vscode.StatusBarItem;
  private readonly disposables: vscode.Disposable[] = [];
  /** Tracks servers currently being initialized to avoid duplicate checks */
  private readonly initializingServers = new Set<string>();

  constructor(
    private readonly vs: typeof vscode,
    private readonly notebookTracker: NotebookServerTracker,
    private readonly storageIntegration: StorageIntegration,
    private readonly storageConfigManager: StorageConfigManager,
  ) {
    // Create status bar item
    this.statusBarItem = vs.window.createStatusBarItem(
      vs.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.command = 'per.storage.statusBarClick';
    this.disposables.push(this.statusBarItem);

    // Listen to storage status changes
    this.disposables.push(
      storageIntegration.onDidChangeStatus(() => {
        void this.updateStatusBar();
      }),
    );

    // Listen to active notebook/server context changes
    this.disposables.push(
      notebookTracker.onDidChangeActiveServerContext(() => {
        void this.updateStatusBar();
      }),
    );

    // Register command for status bar click
    this.disposables.push(
      vs.commands.registerCommand('per.storage.statusBarClick', () => {
        void this.showStorageMenu();
      }),
    );

    // Initial update
    void this.updateStatusBar();
  }

  /**
   * Update the status bar item based on current state.
   */
  private async updateStatusBar(): Promise<void> {
    const storageEnabled = this.vs.workspace
      .getConfiguration('per.storage')
      .get<boolean>('enabled', false);

    if (!storageEnabled) {
      this.statusBarItem.hide();
      return;
    }

    const isConfigured = await this.storageConfigManager.isConfigured();

    if (!isConfigured) {
      this.statusBarItem.text = '$(cloud-upload) Storage: Not Configured';
      this.statusBarItem.tooltip = 'Click to configure storage';
      this.statusBarItem.backgroundColor = new this.vs.ThemeColor(
        'statusBarItem.warningBackground',
      );
      this.statusBarItem.show();
      return;
    }

    // Hide if no active notebook connected to a server
    const server = this.notebookTracker.getActiveServer();
    if (!server) {
      this.statusBarItem.hide();
      return;
    }

    const status = this.storageIntegration.getStatus(server.id);

    // If status is uninitialized (NOT_CONFIGURED is the default),
    // trigger initialization. This handles reconnection after VS Code restart.
    if (
      status === StorageStatus.NOT_CONFIGURED &&
      !this.initializingServers.has(server.id) &&
      server.terminal
    ) {
      this.initializingServers.add(server.id);
      const executor = server.terminal.getTerminal();
      void this.storageIntegration
        .checkAndInitializeStatus(executor)
        .finally(() => {
          this.initializingServers.delete(server.id);
        });
      // Show checking status immediately
      this.statusBarItem.text = '$(sync~spin) Storage: Checking...';
      this.statusBarItem.tooltip = 'Checking storage setup';
      this.statusBarItem.backgroundColor = undefined;
      this.statusBarItem.show();
      return;
    }

    switch (status) {
      case StorageStatus.NOT_CONFIGURED:
        // Workspace config is set, but we haven't checked server yet
        // This shouldn't normally appear after initialization
        this.statusBarItem.text = '$(cloud-upload) Storage: Not Checked';
        this.statusBarItem.tooltip = 'Click to check storage status';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case StorageStatus.SETUP_REQUIRED:
        // Workspace configured, but server needs setup
        this.statusBarItem.text = '$(cloud-upload) Storage: Setup Required';
        this.statusBarItem.tooltip = 'Click to setup storage on server';
        this.statusBarItem.backgroundColor = new this.vs.ThemeColor(
          'statusBarItem.warningBackground',
        );
        break;

      case StorageStatus.CHECKING:
        this.statusBarItem.text = '$(sync~spin) Storage: Checking...';
        this.statusBarItem.tooltip = 'Checking storage setup';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case StorageStatus.INSTALLING:
        this.statusBarItem.text = '$(sync~spin) Storage: Installing...';
        this.statusBarItem.tooltip = 'Installing rclone on server';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case StorageStatus.SYNCING:
        this.statusBarItem.text = '$(sync~spin) Storage: Syncing...';
        this.statusBarItem.tooltip = 'Synchronizing files';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case StorageStatus.READY:
        this.statusBarItem.text = '$(cloud-upload) Storage: Ready';
        this.statusBarItem.tooltip = 'Storage ready - Click for options';
        this.statusBarItem.backgroundColor = undefined;
        break;

      case StorageStatus.ERROR:
        this.statusBarItem.text = '$(error) Storage: Error';
        this.statusBarItem.tooltip = 'Storage setup failed - Click to retry';
        this.statusBarItem.backgroundColor = new this.vs.ThemeColor(
          'statusBarItem.errorBackground',
        );
        break;

      default:
        this.statusBarItem.text = '$(cloud-upload) Storage';
        this.statusBarItem.tooltip = 'Storage status unknown';
        this.statusBarItem.backgroundColor = undefined;
    }

    this.statusBarItem.show();
  }

  /**
   * Show quick pick menu with storage options.
   */
  private async showStorageMenu(): Promise<void> {
    const isConfigured = await this.storageConfigManager.isConfigured();

    if (!isConfigured) {
      await this.vs.commands.executeCommand('per.configureStorage');
      return;
    }

    const server = this.notebookTracker.getActiveServer();
    if (!server) {
      await this.vs.window.showWarningMessage(
        'Open a notebook connected to a PER server first.',
      );
      return;
    }

    const status = this.storageIntegration.getStatus(server.id);

    const items: vscode.QuickPickItem[] = [];

    // Setup option if not ready
    if (status !== StorageStatus.READY) {
      items.push({
        label: '$(tools) Setup Storage on Server',
        description: 'Install and configure rclone',
      });
    }

    // Sync option if ready
    if (status === StorageStatus.READY) {
      items.push({
        label: '$(sync) Sync Now',
        description: 'Manually trigger storage sync',
      });
    }

    // Always available options
    items.push(
      {
        label: '$(check) Validate Setup',
        description: 'Check storage configuration',
      },
      {
        label: '$(gear) Configure Storage',
        description: 'Change storage settings',
      },
    );

    const config = await this.storageConfigManager.get();
    if (config) {
      items.push({
        label: '$(info) Storage Info',
        description: `Remote: ${config.remoteRootPath}`,
      });
    }

    const selected = await this.vs.window.showQuickPick(items, {
      title: 'Storage Options',
      placeHolder: 'Choose an action',
    });

    if (!selected) {
      return;
    }

    // Execute the selected action
    if (selected.label.includes('Setup Storage')) {
      await this.vs.commands.executeCommand('per.storage.setupServer');
    } else if (selected.label.includes('Sync Now')) {
      await this.vs.commands.executeCommand('per.storage.syncNow');
    } else if (selected.label.includes('Validate Setup')) {
      await this.vs.commands.executeCommand('per.storage.validateSetup');
    } else if (selected.label.includes('Configure Storage')) {
      await this.vs.commands.executeCommand('per.configureStorage');
    } else if (selected.label.includes('Storage Info')) {
      // Show storage info
      if (config) {
        const lastSync = config.lastSync
          ? new Date(config.lastSync).toLocaleString()
          : 'Never';
        await this.vs.window.showInformationMessage(
          `Remote Path: ${config.remoteRootPath}\nLast Sync: ${lastSync}`,
        );
      }
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
  }
}
