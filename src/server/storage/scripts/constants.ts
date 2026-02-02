/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Constants for storage scripts and configuration.
 */

/**
 * Default rclone installation URL.
 */
export const RCLONE_INSTALL_URL = 'https://rclone.org/install.sh';

/**
 * Default patterns to exclude from sync operations.
 */
export const DEFAULT_EXCLUDE_PATTERNS = ['.git/**', '*.tmp', '*.swp'];

/**
 * Default local path for synced projects on Colab servers.
 */
export const DEFAULT_LOCAL_PATH = '/content/project';

/**
 * Default rclone config path.
 */
export const DEFAULT_RCLONE_CONFIG_PATH = '~/.config/rclone/rclone.conf';

/**
 * Default sync interval in seconds (5 minutes).
 */
export const DEFAULT_SYNC_INTERVAL_SECONDS = 300;

/**
 * Rclone config file permissions (owner read/write only).
 */
export const RCLONE_CONFIG_PERMISSIONS = '600';

/**
 * Minimum recommended sync interval in seconds (1 minute).
 */
export const MIN_SYNC_INTERVAL_SECONDS = 60;

/**
 * Maximum recommended sync interval in seconds (1 hour).
 */
export const MAX_SYNC_INTERVAL_SECONDS = 3600;