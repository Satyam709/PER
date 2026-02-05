/**
 * @license
 * Copyright 2026 Satyam
 * SPDX-License-Identifier: Apache-2.0
 */

import { JupyterServer } from '@vscode/jupyter-extension';
import vscode from 'vscode';
import { NotebookServerTracker } from '../../../jupyter/notebook-server-tracker';
import { TerminalProvider } from '../../../jupyter/servers';
import { StorageConfigManager } from '../../storage/config';
import { StorageConfigPicker } from '../../storage/storage-config-picker';
import {
  StorageIntegration,
  StorageStatus,
} from '../../storage/storage-integration';

/**
 * Configure cloud storage for the current workspace.
 */
export async function configureStorage(
  vs: typeof vscode,
  storageConfigManager: StorageConfigManager,
): Promise<void> {
  const picker = new StorageConfigPicker(vs, storageConfigManager);
  const configured = await picker.prompt();

  if (configured) {
    // Check if storage is enabled
    const storageEnabled = vs.workspace
      .getConfiguration('per.storage')
      .get<boolean>('enabled', false);

    if (!storageEnabled) {
      const enable = 'Enable Storage';
      const choice = await vs.window.showInformationMessage(
        'Storage configured successfully! Enable storage to automatically sync when connecting to servers.',
        enable,
        'Later',
      );
      if (choice === enable) {
        await vs.workspace
          .getConfiguration('per.storage')
          .update('enabled', true, true);
        await vs.window.showInformationMessage(
          'Storage enabled. Connect to a server to start synchronization.',
        );
      }
    } else {
      await vs.window.showInformationMessage(
        'Storage configured. Connect to a server to set up synchronization.',
      );
    }
  }
}

/**
 * Setup storage on a server.
 */
export async function setupStorageOnServer(
  vs: typeof vscode,
  server: (JupyterServer & { terminal?: TerminalProvider }) | undefined,
  storageIntegration: StorageIntegration,
): Promise<void> {
  if (!server) {
    await vs.window.showWarningMessage(
      'Cannot ind active server: Try opening a notebook connected to a PER server first.',
    );
    return;
  }

  try {
    await vs.window.withProgress(
      {
        location: vs.ProgressLocation.Notification,
        title: 'Setting up storage',
        cancellable: false,
      },
      async (progress) => {
        progress.report({ message: 'Getting terminal connection...' });
        if (!server.terminal) {
          throw new Error('No terminal provider available for this server');
        }
        const executor = server.terminal.getTerminal();

        // Listen to status changes to update progress
        const disposable = storageIntegration.onDidChangeStatus((event) => {
          if (event.serverId === server.id) {
            switch (event.status) {
              case StorageStatus.CHECKING:
                progress.report({ message: 'Checking rclone installation...' });
                break;
              case StorageStatus.INSTALLING:
                progress.report({ message: 'Installing rclone...' });
                break;
              case StorageStatus.SYNCING:
                progress.report({ message: 'Performing initial sync...' });
                break;
              case StorageStatus.READY:
                progress.report({ message: 'Setup complete!' });
                break;
              case StorageStatus.ERROR:
                progress.report({ message: 'Setup failed' });
                break;
            }
          }
        });

        try {
          const result = await storageIntegration.setupOnServer(executor);

          if (result.success) {
            progress.report({
              message: `Setup complete!`,
            });
          } else {
            throw new Error(result.error ?? result.message ?? 'Unknown error');
          }
        } finally {
          disposable.dispose();
        }
      },
    );
  } catch (error) {
    await vs.window.showErrorMessage(
      `Storage setup failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Manually trigger storage sync for the active notebook's server.
 */
export async function syncStorage(
  vs: typeof vscode,
  notebookTracker: NotebookServerTracker,
  storageIntegration: StorageIntegration,
): Promise<void> {
  const server = notebookTracker.getActiveServer();
  if (!server) {
    await vs.window.showWarningMessage(
      'Open a notebook connected to a PER server first.',
    );
    return;
  }

  const status = storageIntegration.getStatus(server.id);
  if (status !== StorageStatus.READY) {
    const setup = 'Setup Storage';
    const choice = await vs.window.showWarningMessage(
      `Storage is not ready (status: ${status}). Would you like to set it up?`,
      setup,
    );
    if (choice === setup) {
      await setupStorageOnServer(
        vs,
        notebookTracker.getActiveServer(),
        storageIntegration,
      );
    }
    return;
  }

  try {
    await vs.window.withProgress(
      {
        location: vs.ProgressLocation.Notification,
        title: 'Syncing storage',
        cancellable: false,
      },
      async (progress) => {
        if (!server.terminal) {
          throw new Error('No terminal provider available for this server');
        }
        const executor = server.terminal.getTerminal();

        // Listen to status changes to update progress
        const disposable = storageIntegration.onDidChangeStatus((event) => {
          if (event.serverId === server.id) {
            switch (event.status) {
              case StorageStatus.SYNCING:
                progress.report({ message: 'Syncing files...' });
                break;
              case StorageStatus.READY:
                progress.report({ message: 'Sync complete!' });
                break;
              case StorageStatus.ERROR:
                progress.report({ message: 'Sync failed' });
                break;
            }
          }
        });

        try {
          const result = await storageIntegration.syncNow(executor);

          if (result.success) {
            progress.report({
              message: `Complete!`,
            });
          } else {
            throw new Error(result.error ?? result.message ?? 'Unknown error');
          }
        } finally {
          disposable.dispose();
        }
      },
    );
  } catch (error) {
    await vs.window.showErrorMessage(
      `Sync failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}

/**
 * Validate storage setup on the current server.
 */
export async function validateStorageSetup(
  vs: typeof vscode,
  notebookTracker: NotebookServerTracker,
  storageIntegration: StorageIntegration,
): Promise<void> {
  const server = notebookTracker.getActiveServer();
  if (!server) {
    await vs.window.showWarningMessage(
      'Open a notebook connected to a PER server first.',
    );
    return;
  }

  if (!server.terminal) {
    await vs.window.showWarningMessage(
      'No terminal provider available for this server.',
    );
    return;
  }
  const executor = server.terminal.getTerminal();
  const result = await storageIntegration.validateSetup(executor);

  if (result.success) {
    await vs.window.showInformationMessage(
      `✓ ${result.message ?? 'Storage setup is valid'}`,
    );
  } else {
    await vs.window.showWarningMessage(
      `✗ ${result.error ?? result.message ?? 'Validation failed'}`,
    );
  }
}
