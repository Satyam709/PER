/**
 * @license
 * Copyright 2026 Satyam
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Script builders for storage operations.
 *
 * These builders generate shell scripts as strings that can be executed
 * on remote servers. All scripts are TypeScript-based for better type safety
 * and maintainability.
 */

import { DEFAULT_EXCLUDE_PATTERNS, RCLONE_INSTALL_URL } from './constants';

/**
 * Options for building rclone installation script.
 */
export interface InstallRcloneOptions {
  /** Whether to force reinstall even if rclone exists */
  forceReinstall?: boolean;
  /** Custom installation URL */
  installUrl?: string;
}

/**
 * Options for building sync scripts.
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
 * Options for uploading rclone configuration.
 */
export interface UploadConfigOptions {
  /** Base64-encoded rclone configuration content */
  configContent: string;
  /** Custom config path (defaults to ~/.config/rclone/rclone.conf) */
  configPath?: string;
}

/**
 * Options for sync daemon.
 */
export interface SyncDaemonOptions extends SyncOptions {
  /** Sync interval in seconds (default: 300) */
  intervalSeconds?: number;
  /** Whether to run bidirectional sync */
  bidirectional?: boolean;
}

/**
 * Builder for rclone installation script.
 *
 * Generates a bash script that installs rclone on a Linux server.
 */
export class InstallRcloneScriptBuilder {
  private options: Required<InstallRcloneOptions>;

  constructor(options: InstallRcloneOptions = {}) {
    this.options = {
      forceReinstall: options.forceReinstall ?? false,
      installUrl: options.installUrl ?? RCLONE_INSTALL_URL,
    };
  }

  /**
   * Build the installation script.
   */
  build(): string {
    const { forceReinstall, installUrl } = this.options;

    return `#!/bin/bash
set -e

${
  !forceReinstall
    ? `
if command -v rclone &> /dev/null; then
    echo "rclone already installed: $(rclone version | head -n1)"
    exit 0
fi
`
    : ''
}

echo "Installing rclone..."
curl ${installUrl} | sudo bash

if command -v rclone &> /dev/null; then
    echo "rclone installed successfully: $(rclone version | head -n1)"
else
    echo "Failed to install rclone"
    exit 1
fi
`;
  }
}

/**
 * Builder for rclone configuration upload script.
 *
 * Generates a bash script that uploads and configures rclone on a server.
 */
export class UploadConfigScriptBuilder {
  private options: Required<UploadConfigOptions>;

  constructor(options: UploadConfigOptions) {
    this.options = {
      configContent: options.configContent,
      configPath: options.configPath ?? '~/.config/rclone/rclone.conf',
    };
  }

  /**
   * Build the upload script.
   */
  build(): string {
    const { configContent, configPath } = this.options;

    // Decode base64 config
    const decodedConfig = Buffer.from(configContent, 'base64').toString(
      'utf-8',
    );

    // Escape single quotes for safe embedding in heredoc
    const escapedConfig = decodedConfig.replace(/'/g, "'\\''");

    const configDir = configPath.replace(/\/[^/]+$/, '');

    return `#!/bin/bash
set -e

echo "Creating rclone config directory..."
mkdir -p ${configDir}

echo "Writing rclone configuration..."
cat > ${configPath} << 'EOF'
${escapedConfig}
EOF

echo "Setting config permissions..."
chmod 600 ${configPath}

echo "Rclone config uploaded successfully to ${configPath}"
`;
  }
}

/**
 * Builder for sync operation script.
 * 
 * Generates a bash script for syncing files between remote and local using
 * rclone bisync for true bidirectional synchronization.
 */
export class SyncScriptBuilder {
  private options: Required<SyncOptions>;

  constructor(options: SyncOptions) {
    this.options = {
      remotePath: options.remotePath,
      localPath: options.localPath,
      excludePatterns: options.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS,
      verbose: options.verbose ?? false,
      additionalFlags: options.additionalFlags ?? [],
    };
  }

  /**
   * Build flags for rclone sync command.
   */
  private buildFlags(): string {
    const flags: string[] = [];

    if (this.options.verbose) {
      flags.push('-v');
    }

    for (const pattern of this.options.excludePatterns) {
      flags.push(`--exclude "${pattern}"`);
    }

    flags.push(...this.options.additionalFlags);

    return flags.join(' ');
  }

  /**
   * Build a one-way sync script (remote to local or local to remote).
   */
  build(direction: 'remote-to-local' | 'local-to-remote'): string {
    const { remotePath, localPath } = this.options;
    const flags = this.buildFlags();

    const [source, destination] = direction === 'remote-to-local'
      ? [remotePath, localPath]
      : [localPath, remotePath];

    const directionLabel =
      direction === 'remote-to-local' ? 'remote to local' : 'local to remote';

    return `#!/bin/bash
set -e

echo "Creating local directory..."
mkdir -p "${localPath}"

echo "Starting sync from ${directionLabel}..."
rclone sync "${source}" "${destination}" ${flags}

echo "Sync completed successfully"
`;
  }

  /**
   * Build a bidirectional sync script using rclone bisync.
   * 
   * Uses bisync with --resync on first run to initialize the sync state.
   * Creates remote directory if it doesn't exist.
   */
  buildBidirectional(): string {
    const { remotePath, localPath } = this.options;
    const flags = this.buildFlags();

    return `#!/bin/bash
set -e

echo "Creating local directory..."
mkdir -p "${localPath}"

echo "Ensuring remote directory exists..."
# Parse remote name and path from remotePath (e.g., "drive:per/testing/t1")
REMOTE_PATH="${remotePath}"
REMOTE_NAME="\${REMOTE_PATH%%:*}"
REMOTE_DIR="\${REMOTE_PATH#*:}"

# Check if we can access the remote
if ! rclone about "$REMOTE_NAME:" > /dev/null 2>&1; then
    echo "ERROR: Cannot access remote '$REMOTE_NAME:'"
    echo "Please verify your rclone configuration"
    exit 1
fi

# Try to create the remote directory structure
if [ -n "$REMOTE_DIR" ]; then
    echo "Creating remote directory: $REMOTE_PATH"
    # Use lsf to check if directory exists, create if it doesn't
    if ! rclone lsf "$REMOTE_PATH" --dirs-only > /dev/null 2>&1; then
        echo "Remote directory does not exist, creating it..."
        rclone mkdir "$REMOTE_PATH" 2>&1 || {
            echo "Warning: mkdir failed, but continuing (directory might already exist)"
        }
    else
        echo "Remote directory already exists"
    fi
else
    echo "Using remote root directory"
fi

echo "Starting bidirectional sync with rclone bisync..."

# Check if bisync state exists
BISYNC_STATE_DIR="$HOME/.cache/rclone/bisync"
mkdir -p "$BISYNC_STATE_DIR"
STATE_FILE="$BISYNC_STATE_DIR/$(echo "${remotePath}..${localPath}" | sed 's/[^a-zA-Z0-9]/_/g').lst"

if [ ! -f "$STATE_FILE" ]; then
    echo "First sync - initializing bisync with --resync..."
    rclone bisync "${remotePath}" "${localPath}" --resync ${flags} --create-empty-src-dirs
else
    echo "Running incremental bisync..."
    rclone bisync "${remotePath}" "${localPath}" ${flags} --create-empty-src-dirs
fi

echo "Bidirectional sync completed successfully"
`;
  }
}

/**
 * Builder for sync daemon script.
 *
 * Generates a bash script that runs continuous background syncing.
 */
export class SyncDaemonScriptBuilder {
  private options: Required<SyncDaemonOptions>;

  constructor(options: SyncDaemonOptions) {
    this.options = {
      remotePath: options.remotePath,
      localPath: options.localPath,
      excludePatterns: options.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS,
      verbose: options.verbose ?? false,
      additionalFlags: options.additionalFlags ?? [],
      intervalSeconds: options.intervalSeconds ?? 300,
      bidirectional: options.bidirectional ?? true,
    };
  }

  /**
   * Build flags for rclone sync command.
   */
  private buildFlags(): string {
    const flags: string[] = [];

    if (this.options.verbose) {
      flags.push('-v');
    }

    for (const pattern of this.options.excludePatterns) {
      flags.push(`--exclude "${pattern}"`);
    }

    flags.push(...this.options.additionalFlags);

    return flags.join(' ');
  }

  /**
   * Build the daemon script.
   */
  build(): string {
    const { remotePath, localPath, intervalSeconds, bidirectional } =
      this.options;
    const flags = this.buildFlags();

    const syncCommands = bidirectional
      ? `
    echo "[$(date)] Syncing local to remote..."
    rclone sync "${localPath}" "${remotePath}" ${flags}
    
    echo "[$(date)] Syncing remote to local..."
    rclone sync "${remotePath}" "${localPath}" ${flags}`
      : `
    echo "[$(date)] Syncing remote to local..."
    rclone sync "${remotePath}" "${localPath}" ${flags}`;

    return `#!/bin/bash
set -e

REMOTE_PATH="${remotePath}"
LOCAL_PATH="${localPath}"
INTERVAL="${String(intervalSeconds)}"

echo "Starting sync daemon..."
echo "Remote: $REMOTE_PATH"
echo "Local: $LOCAL_PATH"
echo "Interval: \${INTERVAL}s"
echo "Bidirectional: ${String(bidirectional)}"

# Create local directory
mkdir -p "$LOCAL_PATH"

# Trap SIGTERM and SIGINT for graceful shutdown
trap 'echo "[$(date)] Sync daemon stopped"; exit 0' SIGTERM SIGINT

while true; do
    echo "[$(date)] Starting sync cycle..."
    ${syncCommands}
    
    echo "[$(date)] Sync cycle completed. Sleeping for \${INTERVAL}s..."
    sleep "$INTERVAL"
done
`;
  }
}

/**
 * Options for cron job setup.
 */
export interface CronJobOptions extends SyncOptions {
  /** Cron schedule expression (default: every 10 minutes) */
  schedule?: string;
  /** Log file path for cron output */
  logFile?: string;
}

/**
 * Builder for cron job setup script.
 * 
 * Generates a bash script that sets up a cron job for automatic syncing.
 */
export class CronJobScriptBuilder {
  private options: Required<CronJobOptions>;

  constructor(options: CronJobOptions) {
    this.options = {
      remotePath: options.remotePath,
      localPath: options.localPath,
      excludePatterns: options.excludePatterns ?? DEFAULT_EXCLUDE_PATTERNS,
      verbose: options.verbose ?? false,
      additionalFlags: options.additionalFlags ?? [],
      schedule: options.schedule ?? '*/10 * * * *', // Every 10 minutes
      logFile: options.logFile ?? '/tmp/rclone-bisync.log',
    };
  }

  /**
   * Build flags for rclone bisync command.
   */
  private buildFlags(): string {
    const flags: string[] = [];

    if (this.options.verbose) {
      flags.push('-v');
    }

    for (const pattern of this.options.excludePatterns) {
      flags.push(`--exclude "${pattern}"`);
    }

    flags.push(...this.options.additionalFlags);

    return flags.join(' ');
  }

  /**
   * Build the cron job setup script.
   */
  build(): string {
    const { remotePath, localPath, schedule, logFile } = this.options;
    const flags = this.buildFlags();

    return `#!/bin/bash
set -e

echo "Setting up cron job for automatic rclone bisync..."

# Create the sync script
SYNC_SCRIPT="/tmp/rclone-bisync-job.sh"
cat > "$SYNC_SCRIPT" << 'SYNCEOF'
#!/bin/bash
# Automatic bisync job created by Colab VSCode extension

# Create local directory if it doesn't exist
mkdir -p "${localPath}"

# Check if bisync state exists
BISYNC_STATE_DIR="$HOME/.cache/rclone/bisync"
STATE_FILE="$BISYNC_STATE_DIR/$(echo "${remotePath}..${localPath}" | sed 's/[^a-zA-Z0-9]/_/g').lst"

if [ ! -f "$STATE_FILE" ]; then
    echo "[$(date)] First sync - initializing bisync with --resync..."
    rclone bisync "${remotePath}" "${localPath}" --resync ${flags} 2>&1
else
    echo "[$(date)] Running incremental bisync..."
    rclone bisync "${remotePath}" "${localPath}" ${flags} 2>&1
fi

echo "[$(date)] Sync completed"
SYNCEOF

chmod +x "$SYNC_SCRIPT"

# Add cron job
CRON_CMD="$SYNC_SCRIPT >> ${logFile} 2>&1"
CRON_ENTRY="${schedule} $CRON_CMD"

# Check if cron job already exists
if crontab -l 2>/dev/null | grep -F "$SYNC_SCRIPT" > /dev/null; then
    echo "Cron job already exists, updating..."
    # Remove old entry and add new one
    (crontab -l 2>/dev/null | grep -v -F "$SYNC_SCRIPT"; echo "$CRON_ENTRY") | crontab -
else
    echo "Adding new cron job..."
    (crontab -l 2>/dev/null; echo "$CRON_ENTRY") | crontab -
fi

echo "Cron job configured successfully!"
echo "Schedule: ${schedule} (every 10 minutes)"
echo "Log file: ${logFile}"
echo "Sync script: $SYNC_SCRIPT"
echo ""
echo "Current crontab:"
crontab -l
`;
  }

  /**
   * Build a script to remove the cron job.
   */
  buildRemove(): string {
    return `#!/bin/bash
set -e

echo "Removing rclone bisync cron job..."

SYNC_SCRIPT="/tmp/rclone-bisync-job.sh"

if crontab -l 2>/dev/null | grep -F "$SYNC_SCRIPT" > /dev/null; then
    crontab -l 2>/dev/null | grep -v -F "$SYNC_SCRIPT" | crontab -
    echo "Cron job removed successfully"
else
    echo "No cron job found"
fi

# Optionally remove the sync script
if [ -f "$SYNC_SCRIPT" ]; then
    rm "$SYNC_SCRIPT"
    echo "Sync script removed: $SYNC_SCRIPT"
fi

echo ""
echo "Current crontab:"
crontab -l 2>/dev/null || echo "(empty)"
`;
  }
}

/**
 * Builder for validation script.
 *
 * Generates a bash script to validate rclone installation and configuration.
 */
export class ValidationScriptBuilder {
  /**
   * Build the validation script.
   */
  build(): string {
    return `#!/bin/bash

ERRORS=0

# Check if rclone is installed
if ! command -v rclone &> /dev/null; then
    echo "ERROR: rclone is not installed"
    ERRORS=$((ERRORS + 1))
else
    echo "OK: rclone is installed ($(rclone version | head -n1))"
fi

# Check if config file exists
if [ ! -f ~/.config/rclone/rclone.conf ]; then
    echo "ERROR: rclone config file not found"
    ERRORS=$((ERRORS + 1))
else
    echo "OK: rclone config file exists"
    
    # Check if config has remotes
    if rclone listremotes 2>/dev/null | grep -q .; then
        echo "OK: rclone remotes configured"
        echo "Available remotes:"
        rclone listremotes
    else
        echo "ERROR: No rclone remotes configured"
        ERRORS=$((ERRORS + 1))
    fi
fi

# Check if config has proper permissions
if [ -f ~/.config/rclone/rclone.conf ]; then
    PERMS=$(stat -c %a ~/.config/rclone/rclone.conf 2>/dev/null || stat -f %Lp ~/.config/rclone/rclone.conf)
    if [ "$PERMS" != "600" ]; then
        echo "WARNING: rclone config permissions are $PERMS (should be 600)"
    else
        echo "OK: rclone config permissions are correct"
    fi
fi

if [ $ERRORS -gt 0 ]; then
    echo ""
    echo "Validation failed with $ERRORS error(s)"
    exit 1
else
    echo ""
    echo "Validation passed"
    exit 0
fi
`;
  }
}
