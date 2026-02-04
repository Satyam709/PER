/**
 * @license
 * Copyright 2026 Satyam
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Atomic storage operations for rclone management.
 *
 * Each function executes a single atomic operation via the
 * CommandExecutor. This approach is necessary because execute()
 * can only run one command at a time.
 */

import { logWithComponent } from '../../common/logging';
import { CommandExecutor, CommandResult } from '../../jupyter/servers';
import {
  DEFAULT_EXCLUDE_PATTERNS,
  DEFAULT_SAFE_BISYNC_ARGS,
  RCLONE_INSTALL_URL,
} from './constants';

const logger = logWithComponent('StorageOperations');

/**
 * Options for sync operations.
 */
export interface SyncOptions {
  /** Remote path (e.g., "drive:/projects/proj1") */
  remotePath: string;
  /** Local path on the server */
  localPath: string;
  /** Patterns to exclude from sync */
  excludePatterns?: string[];
  /** Verbose output */
  verbose?: boolean;
  /** Additional rclone flags */
  additionalFlags?: string[];
}

/**
 * Build rclone flags from options.
 */
function buildRcloneFlags(options: Partial<SyncOptions>): string {
  const flags: string[] = [];

  if (options.verbose) {
    flags.push('-v');
  }

  const excludePatterns = options.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS;
  for (const pattern of excludePatterns) {
    flags.push(`--exclude "${pattern}"`);
  }

  const additionalFlags = options.additionalFlags ?? DEFAULT_SAFE_BISYNC_ARGS;
  flags.push(...additionalFlags);

  return flags.join(' ');
}

/**
 * Check if rclone is installed on the server.
 */
export async function isRcloneInstalled(
  executor: CommandExecutor,
): Promise<boolean> {
  try {
    logger.debug('Checking if rclone is installed');
    const result = await executor.execute('command -v rclone');
    return result.success && result.exitCode === 0;
  } catch (error) {
    logger.error('Error checking rclone installation:', error);
    return false;
  }
}

/**
 * Get rclone version information.
 */
export async function getRcloneVersion(
  executor: CommandExecutor,
): Promise<string | null> {
  try {
    const result = await executor.execute('rclone version');
    if (result.success) {
      // Extract first line which contains version
      const firstLine = result.output.split('\n')[0];
      return firstLine ? firstLine.trim() : null;
    }
    return null;
  } catch (error) {
    logger.error('Error getting rclone version:', error);
    return null;
  }
}

/**
 * Install rclone on the server.
 *
 * @param executor - Command executor
 * @param forceReinstall - Whether to reinstall even if rclone exists
 */
export async function installRclone(
  executor: CommandExecutor,
  forceReinstall = false,
): Promise<CommandResult> {
  logger.info('Installing rclone...');

  // Check if already installed
  if (!forceReinstall) {
    const installed = await isRcloneInstalled(executor);
    if (installed) {
      const version = await getRcloneVersion(executor);
      logger.info(`Rclone already installed: ${version ?? 'unknown version'}`);
      return {
        success: true,
        exitCode: 0,
        output: `rclone already installed: ${version ?? 'unknown version'}`,
      };
    }
  }

  // Install rclone using curl
  const installCmd = `curl "${RCLONE_INSTALL_URL}" | sudo bash`;
  logger.debug('Executing rclone installation command');
  return await executor.execute(installCmd);
}

/**
 * Check if rclone config file exists on the server.
 */
export async function hasRcloneConfig(
  executor: CommandExecutor,
  configPath = '~/.config/rclone/rclone.conf',
): Promise<boolean> {
  try {
    const cmd = `test -f ${configPath}`;
    const result = await executor.execute(cmd);
    return result.success;
  } catch (error) {
    logger.error('Error checking rclone config:', error);
    return false;
  }
}

/**
 * Create rclone config directory on the server.
 */
export async function createRcloneConfigDir(
  executor: CommandExecutor,
  configPath = '~/.config/rclone/rclone.conf',
): Promise<CommandResult> {
  const configDir = configPath.replace(/\/[^/]+$/, '');
  logger.debug(`Creating rclone config directory: ${configDir}`);
  return createLocalDir(executor, configDir);
}

/**
 * Upload rclone configuration to the server.
 *
 * @param executor - Command executor
 * @param configContent - Base64-encoded rclone configuration
 * @param configPath - Path to save the config file
 */
export async function uploadRcloneConfig(
  executor: CommandExecutor,
  configContent: string,
  configPath = '~/.config/rclone/rclone.conf',
): Promise<CommandResult> {
  logger.info('Uploading rclone configuration...');

  // Create config directory
  const dirResult = await createRcloneConfigDir(executor, configPath);
  if (!dirResult.success) {
    logger.error('Failed to create rclone config directory');
    return dirResult;
  }

  // Decode base64 config
  const decodedConfig = Buffer.from(configContent, 'base64').toString('utf-8');

  // Escape single quotes for safe embedding in heredoc
  const escapedConfig = decodedConfig.replace(/'/g, "'\\''");

  const writeCmd = `cat > ${configPath} << 'EOF'\n${escapedConfig}\nEOF`;

  const result = await executor.execute(writeCmd);

  if (!result.success) {
    logger.error('Failed to write rclone config');
    return result;
  }

  // Set proper permissions
  logger.debug('Setting config permissions to 600');
  return await executor.execute(`chmod 600 ${configPath}`);
}

/**
 * List configured rclone remotes.
 */
export async function listRcloneRemotes(
  executor: CommandExecutor,
): Promise<string[]> {
  try {
    const result = await executor.execute('rclone listremotes');
    if (result.success) {
      return result.output
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    }
    return [];
  } catch (error) {
    logger.error('Error listing rclone remotes:', error);
    return [];
  }
}

/**
 * Check if a remote is accessible.
 */
export async function isRemoteAccessible(
  executor: CommandExecutor,
  remoteName: string,
): Promise<boolean> {
  try {
    const result = await executor.execute(`rclone about "${remoteName}:" 2>&1`);
    return result.success;
  } catch (error) {
    logger.error(`Error checking remote ${remoteName}:`, error);
    return false;
  }
}

/**
 * Create a directory on the remote.
 */
export async function createRemoteDir(
  executor: CommandExecutor,
  remotePath: string,
): Promise<CommandResult> {
  logger.debug(`Creating remote directory: ${remotePath}`);
  return await executor.execute(`rclone mkdir "${remotePath}"`);
}

/**
 * Check if a remote directory exists.
 */
export async function remotePathExists(
  executor: CommandExecutor,
  remotePath: string,
): Promise<boolean> {
  try {
    const result = await executor.execute(`rclone lsd "${remotePath}" 2>&1`);
    return result.success;
  } catch (error) {
    logger.error(`Error checking remote path ${remotePath}:`, error);
    return false;
  }
}

/**
 * Create local directory on the server.
 */
export async function createLocalDir(
  executor: CommandExecutor,
  localPath: string,
): Promise<CommandResult> {
  logger.debug(`Creating local directory: ${localPath}`);
  return await executor.execute(`mkdir -p ${localPath}`);
}

/**
 * Create check file for bisync --check-access.
 */
export async function createCheckFile(
  executor: CommandExecutor,
  remotePath: string,
): Promise<CommandResult> {
  logger.debug('Creating check file for bisync');
  return await executor.execute(`rclone touch "${remotePath}/RCLONE_TEST"`);
}

/**
 * Check if bisync state exists for a path pair.
 */
export async function bisyncStateExists(
  executor: CommandExecutor,
  remotePath: string,
  localPath: string,
): Promise<boolean> {
  try {
    // Generate state file name
    const stateId = `${remotePath}..${localPath}`.replace(/[^a-zA-Z0-9]/g, '_');
    const stateFile = `$HOME/.cache/rclone/bisync/${stateId}.lst`;

    const cmd = `test -f ${stateFile}`;
    const result = await executor.execute(cmd);
    return result.success;
  } catch (error) {
    logger.error('Error checking bisync state:', error);
    return false;
  }
}

/**
 * Perform initial resync to initialize bisync state.
 *
 * This sets up the bisync listings and prepares for incremental syncs.
 */
export async function performInitialResync(
  executor: CommandExecutor,
  options: SyncOptions,
): Promise<CommandResult> {
  const { remotePath, localPath } = options;
  logger.info('Performing initial resync...', { remotePath, localPath });

  // Verify remote is accessible
  const remoteName = remotePath.split(':')[0];
  if (remoteName) {
    const accessible = await isRemoteAccessible(executor, remoteName);
    if (!accessible) {
      return {
        success: false,
        exitCode: 1,
        output: '',
        error: `Cannot access remote '${remoteName}:'`,
      };
    }
  }

  // Create remote directory if needed
  const remoteExists = await remotePathExists(executor, remotePath);
  if (!remoteExists) {
    const createResult = await createRemoteDir(executor, remotePath);
    if (!createResult.success) {
      return createResult;
    }
  }

  // Create local directory
  const localDirResult = await createLocalDir(executor, localPath);
  if (!localDirResult.success) {
    return localDirResult;
  }

  // Create check file
  const checkFileResult = await createCheckFile(executor, remotePath);
  if (!checkFileResult.success) {
    return checkFileResult;
  }

  // Dry run resync
  const flags = buildRcloneFlags(options);
  logger.debug('Running dry-run resync');
  const dryRunCmd = `rclone bisync "${remotePath}" "${localPath}" ${flags} --resync --dry-run`;
  const dryRunResult = await executor.execute(dryRunCmd);

  if (!dryRunResult.success) {
    logger.error('Dry-run resync failed');
    return dryRunResult;
  }

  // Actual resync
  logger.debug('Running actual resync');
  const resyncCmd = `rclone bisync "${remotePath}" "${localPath}" ${flags} --resync`;
  return await executor.execute(resyncCmd);
}

/**
 * Perform incremental bidirectional sync.
 */
export async function performBidirectionalSync(
  executor: CommandExecutor,
  options: SyncOptions,
): Promise<CommandResult> {
  const { remotePath, localPath } = options;
  logger.info('Performing bidirectional sync...', { remotePath, localPath });

  // Check if state exists
  const stateExists = await bisyncStateExists(executor, remotePath, localPath);

  if (!stateExists) {
    logger.warn('Bisync state does not exist, performing initial resync');
    return await performInitialResync(executor, options);
  }

  // Run incremental bisync
  const flags = buildRcloneFlags(options);
  const bisyncCmd = `rclone bisync "${remotePath}" "${localPath}" ${flags}`;
  return await executor.execute(bisyncCmd);
}

/**
 * Perform one-way sync from remote to local.
 */
export async function syncRemoteToLocal(
  executor: CommandExecutor,
  options: SyncOptions,
): Promise<CommandResult> {
  const { remotePath, localPath } = options;
  logger.info('Syncing from remote to local...', { remotePath, localPath });

  // Create local directory
  await createLocalDir(executor, localPath);

  // Sync
  const flags = buildRcloneFlags(options);
  const syncCmd = `rclone sync "${remotePath}" "${localPath}" ${flags}`;
  return await executor.execute(syncCmd);
}

/**
 * Perform one-way sync from local to remote.
 */
export async function syncLocalToRemote(
  executor: CommandExecutor,
  options: SyncOptions,
): Promise<CommandResult> {
  const { remotePath, localPath } = options;
  logger.info('Syncing from local to remote...', { remotePath, localPath });

  // Sync
  const flags = buildRcloneFlags(options);
  const syncCmd = `rclone sync "${localPath}" "${remotePath}" ${flags}`;
  return await executor.execute(syncCmd);
}

/**
 * Validate rclone setup on the server.
 */
export async function validateRcloneSetup(
  executor: CommandExecutor,
): Promise<{ valid: boolean; message: string }> {
  // Check if rclone is installed
  const installed = await isRcloneInstalled(executor);
  if (!installed) {
    return { valid: false, message: 'rclone is not installed' };
  }

  const version = await getRcloneVersion(executor);
  logger.debug(`Rclone version: ${version ?? 'unknown'}`);

  // Check if config exists
  const hasConfig = await hasRcloneConfig(executor);
  if (!hasConfig) {
    return { valid: false, message: 'rclone config file not found' };
  }

  // Check if remotes are configured
  const remotes = await listRcloneRemotes(executor);
  if (remotes.length === 0) {
    return { valid: false, message: 'No rclone remotes configured' };
  }

  logger.debug(`Available remotes: ${remotes.join(', ')}`);

  const versionStr = version ?? 'unknown version';
  const remoteCount = String(remotes.length);
  return {
    valid: true,
    message: `rclone setup valid (${versionStr}, ${remoteCount} remote(s))`,
  };
}
