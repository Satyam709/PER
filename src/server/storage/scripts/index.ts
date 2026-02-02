/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Centralized storage scripts module.
 * 
 * Exports script builders and constants for storage operations.
 */

export {
  InstallRcloneScriptBuilder,
  UploadConfigScriptBuilder,
  SyncScriptBuilder,
  SyncDaemonScriptBuilder,
  CronJobScriptBuilder,
  ValidationScriptBuilder,
} from './builders';

export type {
  InstallRcloneOptions,
  SyncOptions,
  UploadConfigOptions,
  SyncDaemonOptions,
  CronJobOptions,
} from './builders';

export {
  RCLONE_INSTALL_URL,
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_LOCAL_PATH,
  DEFAULT_RCLONE_CONFIG_PATH,
  DEFAULT_SYNC_INTERVAL_SECONDS,
  RCLONE_CONFIG_PERMISSIONS,
  MIN_SYNC_INTERVAL_SECONDS,
  MAX_SYNC_INTERVAL_SECONDS,
} from './constants';