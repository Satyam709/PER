/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/** Identifying information for a command. */
export interface Command {
  /** The human readable label of the registered command. */
  readonly label: string;
  /** An optional icon for the command if it appears outside of the command palette. */
  readonly icon?: string;
  /** An optional description of the command. */
  readonly description?: string;
}

/** Identifying information for a registered command. */
export interface RegisteredCommand extends Command {
  /** The ID of the registered command. */
  readonly id: string;
}

/** Command to mount a server's file-system. */
export const MOUNT_SERVER: RegisteredCommand = {
  id: 'per.mountServer',
  label: 'Mount Server to Workspace',
  icon: 'remote',
  description: 'Reloads VS Code if a Workspace is not already open.',
};

/** Command to remove a server. */
export const REMOVE_SERVER: RegisteredCommand = {
  id: 'per.removeServer',
  label: 'Remove Server',
  icon: 'trash',
};

/** Command to rename a server alias. */
export const RENAME_SERVER_ALIAS: RegisteredCommand = {
  id: 'per.renameServerAlias',
  label: 'Rename Server Alias',
};

/** Command to upload files to a server. */
export const UPLOAD: RegisteredCommand = {
  id: 'per.upload',
  label: 'Upload to PER',
  icon: 'cloud-upload',
};

/** Command to sign out. */
export const SIGN_OUT: RegisteredCommand = {
  id: 'per.signOut',
  label: 'Sign Out',
};