/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode';
import { AssignmentManager } from '../../../jupyter/assignments';
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
  assignmentManager: AssignmentManager,
  storageIntegration: StorageIntegration,
): Promise<void> {
  const server = await assignmentManager.latestServer();
  if (!server) {
    await vs.window.showWarningMessage('No active server found.');
    return;
  }

  const executor = assignmentManager.getExecutor(server.id);
  if (!executor) {
    await vs.window.showErrorMessage(
      'Server executor not available. Try reconnecting to the server.',
    );
    return;
  }

  await vs.window.withProgress(
    {
      location: vs.ProgressLocation.Notification,
      title: 'Setting up storage on server',
      cancellable: false,
    },
    async (progress) => {
      progress.report({ message: 'Installing rclone...' });
      const result = await storageIntegration.setupOnServer(server, executor);

      if (result.success) {
        await vs.window.showInformationMessage(
          result.message ?? 'Storage setup complete',
        );
      } else {
        await vs.window.showErrorMessage(
          `Storage setup failed: ${result.error ?? result.message ?? 'Unknown error'}`,
        );
      }
    },
  );
}

/**
 * Manually trigger storage sync for the active notebook's server.
 */
export async function syncStorage(
  vs: typeof vscode,
  assignmentManager: AssignmentManager,
  storageIntegration: StorageIntegration,
): Promise<void> {
  const server = await assignmentManager.latestServer();
  if (!server) {
    await vs.window.showWarningMessage('No active server found.');
    return;
  }

  const executor = assignmentManager.getExecutor(server.id);
  if (!executor) {
    await vs.window.showErrorMessage(
      'Server executor not available. Try reconnecting to the server.',
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
      await setupStorageOnServer(vs, assignmentManager, storageIntegration);
    }
    return;
  }

  await vs.window.withProgress(
    {
      location: vs.ProgressLocation.Notification,
      title: 'Syncing storage',
      cancellable: false,
    },
    async () => {
      const result = await storageIntegration.syncNow(server, executor);

      if (result.success) {
        await vs.window.showInformationMessage(
          result.message ?? 'Sync complete',
        );
      } else {
        await vs.window.showErrorMessage(
          `Sync failed: ${result.error ?? result.message ?? 'Unknown error'}`,
        );
      }
    },
  );
}

/**
 * Validate storage setup on the current server.
 */
export async function validateStorageSetup(
  vs: typeof vscode,
  assignmentManager: AssignmentManager,
  storageIntegration: StorageIntegration,
): Promise<void> {
  const server = await assignmentManager.latestServer();
  if (!server) {
    await vs.window.showWarningMessage('No active server found.');
    return;
  }

  const executor = assignmentManager.getExecutor(server.id);
  if (!executor) {
    await vs.window.showErrorMessage(
      'Server executor not available. Try reconnecting to the server.',
    );
    return;
  }

  const result = await storageIntegration.validateSetup(server, executor);

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
