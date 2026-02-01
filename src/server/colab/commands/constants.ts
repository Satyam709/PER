/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

// Re-export shared command types
export type { Command, RegisteredCommand } from '../../commands/constants';

/** Command to open the toolbar command selection. */
export const COLAB_TOOLBAR: import('../../commands/constants').RegisteredCommand =
  {
    id: 'per.toolbarCommand',
    label: 'PER',
  };

/** Command to open the Colab submenu. */
export const COLAB_SUBMENU: import('../../commands/constants').RegisteredCommand =
  {
    id: 'per.colabSubmenu',
    label: 'Colab',
    icon: 'symbol-event',
  };

/** Command to trigger the sign-in flow, to view existing Colab servers. */
export const SIGN_IN_VIEW_EXISTING: import('../../commands/constants').Command =
  {
    label: 'View Existing Servers',
    icon: 'sign-in',
    description: 'Click to sign-in...',
  };

/** Command to auto-connect a Colab server. */
export const AUTO_CONNECT: import('../../commands/constants').Command = {
  label: 'Auto Connect',
  icon: 'symbol-event',
  description: '1-click connect! Most recently created server, or a new one.',
};

/** Command to create a new Colab server. */
export const NEW_SERVER: import('../../commands/constants').Command = {
  label: 'New Colab Server',
  icon: 'add',
  description: 'CPU, GPU or TPU.',
};

/** Command to open Colab in the browser. */
export const OPEN_COLAB_WEB: import('../../commands/constants').Command = {
  label: 'Open Colab Web',
  icon: 'link-external',
  description: 'Open Colab web.',
};

/** Command to open the Colab signup page, to upgrade to pro. */
export const UPGRADE_TO_PRO: import('../../commands/constants').Command = {
  label: 'Upgrade to Pro',
  icon: 'accounts-view-bar-icon',
  description: 'More machines, more quota, more Colab!',
};
