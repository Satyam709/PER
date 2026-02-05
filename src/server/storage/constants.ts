/**
 * @license
 * Copyright 2026 Satyam
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
 * Each workspace mounts at /content, so we sync to a workspace-specific
 * subdirectory.
 */
export const DEFAULT_LOCAL_PATH = '/content';

/**
 * Default workspace-specific sync directory name.
 * The actual sync path will be `/content/{workspaceId}`.
 */
export const WORKSPACE_SYNC_DIR_PREFIX = 'workspace';

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
export const MIN_SYNC_INTERVAL_SECONDS = 120;

/**
 * Maximum recommended sync interval in seconds (1 hour).
 */
export const MAX_SYNC_INTERVAL_SECONDS = 3600;

/**
 * Default safe args for bisync refer https://rclone.org/bisync/#check-access
 * WITHOUT --resync and --dry-run
 */
export const DEFAULT_SAFE_BISYNC_ARGS = [
  '--create-empty-src-dirs',
  '--compare size,modtime,checksum',
  '--slow-hash-sync-only',
  '--resilient',
  '-MvP',
  '--conflict-resolve path2',
  '--max-lock 2m',
  '--drive-skip-gdocs',
  '--fix-case',
];

/**
 * Default safe args for resync refer https://rclone.org/bisync/#check-access
 * assumes the source of truth as the remote and as
 * per our convention throughout remote is 'path2'
 *
 * This forces the local to hard sync with remote --can lose local changes
 */
export const RESYNC_FLAG = ['--resync-mode path2'];
