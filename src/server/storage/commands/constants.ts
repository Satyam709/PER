/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Re-export shared command types
export type { Command, RegisteredCommand } from '../../commands/constants';

/** Command to configure cloud storage. */
export const CONFIGURE_STORAGE: import('../../commands/constants').RegisteredCommand =
  {
    id: 'per.configureStorage',
    label: 'Configure Storage',
    icon: 'settings-gear',
    description: 'Set up cloud storage synchronization with rclone',
  };

/** Command to manually sync storage. */
export const SYNC_STORAGE: import('../../commands/constants').RegisteredCommand =
  {
    id: 'per.syncStorage',
    label: 'Sync Storage',
    icon: 'sync',
    description: 'Manually sync workspace with cloud storage',
  };
