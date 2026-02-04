/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized storage scripts module.
 *
 * DEPRECATED: Script builders are deprecated in favor of atomic operations.
 * Use functions from '../operations' instead for better compatibility with
 * single-command execution model.
 *
 * The CronJobScriptBuilder is still supported for cron job setup.
 */

// Export constants (still needed)
export {
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_LOCAL_PATH,
  DEFAULT_RCLONE_CONFIG_PATH,
  DEFAULT_SYNC_INTERVAL_SECONDS,
  MAX_SYNC_INTERVAL_SECONDS,
  MIN_SYNC_INTERVAL_SECONDS,
  RCLONE_CONFIG_PERMISSIONS,
  RCLONE_INSTALL_URL,
} from '../constants';

// Export CronJobScriptBuilder (still used for cron setup)
export { CronJobScriptBuilder } from './builders';
export type { CronJobOptions } from './builders';

// Re-export atomic operations as the recommended approach
export {
  bisyncStateExists,
  createCheckFile,
  createLocalDir,
  createRemoteDir,
  createRcloneConfigDir,
  getRcloneVersion,
  hasRcloneConfig,
  installRclone,
  isRcloneInstalled,
  isRemoteAccessible,
  listRcloneRemotes,
  performBidirectionalSync,
  performInitialResync,
  remotePathExists,
  syncLocalToRemote,
  syncRemoteToLocal,
  uploadRcloneConfig,
  validateRcloneSetup,
} from '../operations';

export type { SyncOptions } from '../operations';

/**
 * @deprecated Use atomic operations from '../operations' instead.
 * Script builders generate multi-line bash scripts that cannot be executed
 * as single commands via execute().
 */
export {
  InstallRcloneScriptBuilder,
  SyncDaemonScriptBuilder,
  SyncScriptBuilder,
  UploadConfigScriptBuilder,
  ValidationScriptBuilder,
} from './builders';

/**
 * @deprecated Use SyncOptions from '../operations' instead.
 */
export type {
  InstallRcloneOptions,
  SyncDaemonOptions,
  UploadConfigOptions,
} from './builders';
