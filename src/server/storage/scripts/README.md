# Storage Scripts

Centralized TypeScript-based script builders for storage operations with rclone.

## Overview

This module provides type-safe builders for generating shell scripts used in storage operations on remote Jupyter servers. All scripts are generated dynamically using TypeScript builders rather than static shell files.

## Architecture

```
src/server/storage/scripts/
├── builders.ts     # Script builder classes
├── constants.ts    # Configuration constants
├── index.ts        # Module exports
└── README.md       # This file
```

## Script Builders

### InstallRcloneScriptBuilder

Generates scripts to install rclone on remote servers.

**Usage:**
```typescript
import { InstallRcloneScriptBuilder } from './scripts';

const builder = new InstallRcloneScriptBuilder({
  forceReinstall: false,  // Skip if already installed
});
const script = builder.build();
```

**Options:**
- `forceReinstall`: Force reinstallation even if rclone exists
- `installUrl`: Custom installation URL (defaults to official rclone URL)

### UploadConfigScriptBuilder

Generates scripts to upload rclone configuration to remote servers.

**Usage:**
```typescript
import { UploadConfigScriptBuilder } from './scripts';

const builder = new UploadConfigScriptBuilder({
  configContent: base64EncodedConfig,
  configPath: '~/.config/rclone/rclone.conf',  // Optional
});
const script = builder.build();
```

**Options:**
- `configContent`: Base64-encoded rclone configuration (required)
- `configPath`: Custom config path (defaults to standard location)

### SyncScriptBuilder

Generates scripts for one-way or bidirectional sync operations.

**Usage:**
```typescript
import { SyncScriptBuilder } from './scripts';

const builder = new SyncScriptBuilder({
  remotePath: 'drive:/projects/myproject',
  localPath: '/content/project',
  excludePatterns: ['.git/**', '*.tmp'],
  verbose: true,
});

// One-way sync
const remoteToLocal = builder.build('remote-to-local');
const localToRemote = builder.build('local-to-remote');

// Bidirectional sync
const bidirectional = builder.buildBidirectional();
```

**Options:**
- `remotePath`: Remote path in format "remote:/path" (required)
- `localPath`: Local path on server (required)
- `excludePatterns`: Patterns to exclude from sync
- `verbose`: Enable verbose output
- `additionalFlags`: Custom rclone flags

### SyncDaemonScriptBuilder

Generates scripts for continuous background syncing.

**Usage:**
```typescript
import { SyncDaemonScriptBuilder } from './scripts';

const builder = new SyncDaemonScriptBuilder({
  remotePath: 'drive:/projects/myproject',
  localPath: '/content/project',
  intervalSeconds: 300,  // 5 minutes
  bidirectional: true,
  verbose: true,
});
const script = builder.build();
```

**Options:**
- All options from `SyncScriptBuilder`
- `intervalSeconds`: Sync interval in seconds (default: 300)
- `bidirectional`: Whether to run bidirectional sync (default: true)

### ValidationScriptBuilder

Generates scripts to validate rclone installation and configuration.

**Usage:**
```typescript
import { ValidationScriptBuilder } from './scripts';

const builder = new ValidationScriptBuilder();
const script = builder.build();
```

## Constants

### Paths and Configuration

- `DEFAULT_LOCAL_PATH`: Default local path on Colab servers (`/content/project`)
- `DEFAULT_RCLONE_CONFIG_PATH`: Standard rclone config location
- `RCLONE_INSTALL_URL`: Official rclone installation script URL

### Sync Configuration

- `DEFAULT_EXCLUDE_PATTERNS`: Default patterns to exclude from sync
  - `.git/**` - Git repository files
  - `*.tmp` - Temporary files
  - `*.swp` - Vim swap files

### Timing

- `DEFAULT_SYNC_INTERVAL_SECONDS`: Default sync interval (300s / 5 minutes)
- `MIN_SYNC_INTERVAL_SECONDS`: Minimum recommended interval (60s)
- `MAX_SYNC_INTERVAL_SECONDS`: Maximum recommended interval (3600s / 1 hour)

### Security

- `RCLONE_CONFIG_PERMISSIONS`: Required permissions for config file (`600`)

## Migration from Shell Scripts

This module replaces the previous shell scripts in `scripts/server-setup/`:
- `install-rclone.sh` → `InstallRcloneScriptBuilder`
- `setup-sync.sh` → `SyncScriptBuilder`
- `sync-daemon.sh` → `SyncDaemonScriptBuilder`

## Benefits

1. **Type Safety**: TypeScript provides compile-time checks for script parameters
2. **Maintainability**: Centralized logic easier to update and test
3. **Flexibility**: Dynamic script generation allows runtime customization
4. **Consistency**: Shared constants ensure uniform behavior across scripts
5. **Documentation**: JSDoc comments provide inline documentation

## Example: Complete Setup Flow

```typescript
import {
  InstallRcloneScriptBuilder,
  UploadConfigScriptBuilder,
  SyncScriptBuilder,
  DEFAULT_LOCAL_PATH,
} from './scripts';

// 1. Install rclone
const installBuilder = new InstallRcloneScriptBuilder();
await executor.execute(installBuilder.build());

// 2. Upload configuration
const configBuilder = new UploadConfigScriptBuilder({
  configContent: base64Config,
});
await executor.execute(configBuilder.build());

// 3. Initial sync
const syncBuilder = new SyncScriptBuilder({
  remotePath: 'drive:/projects/myproject',
  localPath: DEFAULT_LOCAL_PATH,
  verbose: true,
});
await executor.execute(syncBuilder.build('remote-to-local'));
```

## Testing

When writing tests for code using these builders, you can verify the generated scripts:

```typescript
const builder = new InstallRcloneScriptBuilder({ forceReinstall: true });
const script = builder.build();

expect(script).to.include('curl https://rclone.org/install.sh');
expect(script).to.not.include('if command -v rclone');
```

## Future Enhancements

Potential improvements for this module:
- Add support for rclone mount operations
- Include bandwidth limiting options
- Add progress tracking hooks
- Support for encrypted configurations
- Advanced filtering and transformation options