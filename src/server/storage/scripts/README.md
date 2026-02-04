# Storage Operations

This module provides functionality for managing rclone storage operations on remote Jupyter servers.

## Architecture Change

**⚠️ IMPORTANT:** The script builders in `builders.ts` are **DEPRECATED** in favor of atomic operations in `operations.ts`.

### Why Atomic Operations?

The `execute(cmd)` method in `TerminalExecutor` can only execute **single commands**, not multi-line bash scripts. The old script builders generated complex multi-line bash scripts that cannot be executed properly.

**Old approach (DEPRECATED):**
```typescript
// ❌ This generates a multi-line bash script
const builder = new InstallRcloneScriptBuilder();
const script = builder.build(); // Returns multi-line bash script
await executor.execute(script); // FAILS - can only run single command
```

**New approach (RECOMMENDED):**
```typescript
// ✅ Each function executes a single atomic command
import { installRclone, isRcloneInstalled } from './operations';

const installed = await isRcloneInstalled(executor);
if (!installed) {
  await installRclone(executor);
}
```

## Atomic Operations

All operations are located in `../operations.ts` and execute single commands via the executor.

### Installation Operations

#### `isRcloneInstalled(executor)`
Check if rclone is installed on the server.

```typescript
const installed = await isRcloneInstalled(executor);
// Returns: boolean
```

#### `getRcloneVersion(executor)`
Get the installed rclone version.

```typescript
const version = await getRcloneVersion(executor);
// Returns: string | null (e.g., "rclone v1.62.0")
```

#### `installRclone(executor, forceReinstall?)`
Install rclone on the server. Skips if already installed unless `forceReinstall` is true.

```typescript
const result = await installRclone(executor, false);
// Returns: CommandResult { success, exitCode, output, error? }
```

### Configuration Operations

#### `hasRcloneConfig(executor, configPath?)`
Check if rclone config file exists.

```typescript
const hasConfig = await hasRcloneConfig(executor);
// Returns: boolean
```

#### `createRcloneConfigDir(executor, configPath?)`
Create the rclone config directory.

```typescript
const result = await createRcloneConfigDir(executor);
// Returns: CommandResult
```

#### `uploadRcloneConfig(executor, configContent, configPath?)`
Upload rclone configuration to the server.

```typescript
const base64Config = Buffer.from(configContent).toString('base64');
const result = await uploadRcloneConfig(executor, base64Config);
// Returns: CommandResult
```

#### `listRcloneRemotes(executor)`
List all configured remotes.

```typescript
const remotes = await listRcloneRemotes(executor);
// Returns: string[] (e.g., ["drive:", "s3:"])
```

#### `isRemoteAccessible(executor, remoteName)`
Check if a remote is accessible.

```typescript
const accessible = await isRemoteAccessible(executor, "drive");
// Returns: boolean
```

### Sync Operations

#### `performInitialResync(executor, options)`
Perform initial resync to set up bisync state.

```typescript
const result = await performInitialResync(executor, {
  remotePath: 'drive:/projects/myproject',
  localPath: '/content/workspace',
  verbose: true,
  excludePatterns: ['*.pyc', '__pycache__'],
  additionalFlags: ['--check-access'],
});
// Returns: CommandResult
```

This operation:
1. Verifies remote is accessible
2. Creates remote and local directories if needed
3. Creates check file for bisync
4. Runs dry-run resync
5. Performs actual resync

#### `performBidirectionalSync(executor, options)`
Perform incremental bidirectional sync.

```typescript
const result = await performBidirectionalSync(executor, {
  remotePath: 'drive:/projects/myproject',
  localPath: '/content/workspace',
  verbose: true,
});
// Returns: CommandResult
```

Automatically falls back to `performInitialResync` if bisync state doesn't exist.

#### `syncRemoteToLocal(executor, options)`
One-way sync from remote to local.

```typescript
const result = await syncRemoteToLocal(executor, {
  remotePath: 'drive:/projects/myproject',
  localPath: '/content/workspace',
});
// Returns: CommandResult
```

#### `syncLocalToRemote(executor, options)`
One-way sync from local to remote.

```typescript
const result = await syncLocalToRemote(executor, {
  remotePath: 'drive:/projects/myproject',
  localPath: '/content/workspace',
});
// Returns: CommandResult
```

### Validation Operations

#### `validateRcloneSetup(executor)`
Validate complete rclone setup.

```typescript
const validation = await validateRcloneSetup(executor);
// Returns: { valid: boolean, message: string }
// Example: { valid: true, message: "rclone setup valid (v1.62.0, 2 remote(s))" }
```

This checks:
- Rclone is installed
- Config file exists
- At least one remote is configured

### Directory Operations

#### `createRemoteDir(executor, remotePath)`
Create a directory on the remote.

```typescript
const result = await createRemoteDir(executor, 'drive:/projects/newproject');
// Returns: CommandResult
```

#### `remotePathExists(executor, remotePath)`
Check if a remote path exists.

```typescript
const exists = await remotePathExists(executor, 'drive:/projects/myproject');
// Returns: boolean
```

#### `createLocalDir(executor, localPath)`
Create a local directory.

```typescript
const result = await createLocalDir(executor, '/content/workspace');
// Returns: CommandResult
```

### Sync Options

```typescript
interface SyncOptions {
  remotePath: string;           // e.g., "drive:/projects/proj1"
  localPath: string;            // e.g., "/content/workspace"
  excludePatterns?: string[];   // Default: ['*.pyc', '__pycache__', '.git']
  verbose?: boolean;            // Default: false
  additionalFlags?: string[];   // Additional rclone flags
}
```

## Complete Setup Example

```typescript
import {
  installRclone,
  uploadRcloneConfig,
  performInitialResync,
  performBidirectionalSync,
  validateRcloneSetup,
} from '../operations';

async function setupStorage(executor: CommandExecutor) {
  // 1. Install rclone
  const installResult = await installRclone(executor);
  if (!installResult.success) {
    throw new Error('Failed to install rclone');
  }

  // 2. Upload configuration
  const base64Config = Buffer.from(configContent).toString('base64');
  const configResult = await uploadRcloneConfig(executor, base64Config);
  if (!configResult.success) {
    throw new Error('Failed to upload config');
  }

  // 3. Validate setup
  const validation = await validateRcloneSetup(executor);
  if (!validation.valid) {
    throw new Error(`Validation failed: ${validation.message}`);
  }

  // 4. Initial sync
  const syncResult = await performInitialResync(executor, {
    remotePath: 'drive:/projects/myproject',
    localPath: '/content/workspace',
    verbose: true,
  });
  if (!syncResult.success) {
    throw new Error('Initial sync failed');
  }

  // 5. Subsequent syncs
  const incrementalResult = await performBidirectionalSync(executor, {
    remotePath: 'drive:/projects/myproject',
    localPath: '/content/workspace',
  });
}
```

## Legacy Script Builders (DEPRECATED)

The following script builders are deprecated and should not be used:
- `InstallRcloneScriptBuilder` → Use `installRclone()`
- `UploadConfigScriptBuilder` → Use `uploadRcloneConfig()`
- `SyncScriptBuilder` → Use sync operations
- `SyncDaemonScriptBuilder` → Not compatible with single-command execution
- `ValidationScriptBuilder` → Use `validateRcloneSetup()`

The `CronJobScriptBuilder` is still supported for setting up cron jobs, as it requires a multi-line script approach.

## Constants

All constants are exported from `./constants.ts`:

```typescript
export const RCLONE_INSTALL_URL = 'https://rclone.org/install.sh';
export const DEFAULT_EXCLUDE_PATTERNS = ['*.pyc', '__pycache__', '.git'];
export const DEFAULT_LOCAL_PATH = '/content/workspace';
export const DEFAULT_RCLONE_CONFIG_PATH = '~/.config/rclone/rclone.conf';
export const DEFAULT_SYNC_INTERVAL_SECONDS = 300;
export const RCLONE_CONFIG_PERMISSIONS = '600';
export const MIN_SYNC_INTERVAL_SECONDS = 60;
export const MAX_SYNC_INTERVAL_SECONDS = 3600;
export const DEFAULT_SAFE_BISYNC_ARGS = [
  '--check-access',
  '--resilient',
  '--recover',
  '--conflict-resolve=newer',
  '--conflict-loser=num',
];
```

## Error Handling

All operations return `CommandResult` or throw errors that should be caught:

```typescript
try {
  const result = await installRclone(executor);
  if (!result.success) {
    console.error('Installation failed:', result.error);
    console.error('Output:', result.output);
    console.error('Exit code:', result.exitCode);
  }
} catch (error) {
  console.error('Unexpected error:', error);
}