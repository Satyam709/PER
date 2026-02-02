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
 * Generates a bash script for syncing files between remote and local.
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

    const [source, destination] =
      direction === 'remote-to-local'
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
   * Build a bidirectional sync script.
   */
  buildBidirectional(): string {
    const { remotePath, localPath } = this.options;
    const flags = this.buildFlags();

    return `#!/bin/bash
set -e

echo "Creating local directory..."
mkdir -p "${localPath}"

echo "Starting bidirectional sync..."

echo "Syncing local to remote..."
rclone sync "${localPath}" "${remotePath}" ${flags}

echo "Syncing remote to local..."
rclone sync "${remotePath}" "${localPath}" ${flags}

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
