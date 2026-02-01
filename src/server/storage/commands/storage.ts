/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode';
import { AssignmentManager } from '../../../jupyter/assignments';
import { StorageConfigManager } from '../../storage/config';
import { StorageConfigPicker } from '../../storage/storage-config-picker';

/**
 * Configure cloud storage for the current workspace.
 */
export async function configureStorage(
  vs: typeof vscode,
  storageConfigManager: StorageConfigManager,
): Promise<void> {
  const picker = new StorageConfigPicker(vs, storageConfigManager);
  await picker.prompt();
}

/**
 * Manually trigger storage sync for the active notebook's server.
 */
export async function syncStorage(
  vs: typeof vscode,
  _assignmentManager: AssignmentManager,
  storageConfigManager: StorageConfigManager,
): Promise<void> {
  // Check if storage is configured
  const isConfigured = await storageConfigManager.isConfigured();
  if (!isConfigured) {
    const configure = 'Configure Storage';
    const choice = await vs.window.showInformationMessage(
      'Storage is not configured for this workspace.',
      configure,
    );
    if (choice === configure) {
      await configureStorage(vs, storageConfigManager);
    }
    return;
  }

  // TODO: Implement actual sync logic in Phase 4
  // For now, just show a placeholder message
  await vs.window.showInformationMessage(
    'Storage sync will be implemented in Phase 4',
  );
}
