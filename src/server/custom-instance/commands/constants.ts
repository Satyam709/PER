/**
 * @license
 * Copyright 2026 Satyam
 * SPDX-License-Identifier: Apache-2.0
 */

// Re-export shared command types
export type { Command, RegisteredCommand } from '../../commands/constants';

/** Command to open custom instance options. */
export const CUSTOM_INSTANCE: import('../../commands/constants').RegisteredCommand =
  {
    id: 'per.customInstance',
    label: 'Custom Instance',
    icon: 'server',
  };
