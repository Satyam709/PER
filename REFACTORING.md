# Project Structure Refactoring

## Overview
This document describes the major refactoring of the project structure completed on 2026-01-02.

## Changes Made

### 1. New Folder Structure

Created a new `src/server/` directory to organize all server-related code:

```
src/
├── server/                           # NEW: Top-level server organization
│   ├── commands/                     # NEW: Shared server commands
│   │   └── constants.ts             # Server operations: mount, remove, upload, sign out
│   ├── colab/                        # MOVED from src/colab/
│   │   ├── api.ts
│   │   ├── client.ts
│   │   ├── connection-refresher.ts
│   │   ├── files.ts
│   │   ├── headers.ts
│   │   ├── keep-alive.ts
│   │   ├── server-picker.ts
│   │   ├── terminal-executor.ts
│   │   ├── commands/
│   │   │   ├── constants.ts         # Colab-specific commands
│   │   │   ├── external.ts
│   │   │   ├── files.ts
│   │   │   ├── notebook.ts
│   │   │   ├── server.ts
│   │   │   └── utils.ts
│   │   ├── consumption/
│   │   └── server-browser/
│   ├── storage/                      # MOVED from src/cloudstorage/
│   │   ├── config.ts
│   │   ├── rclone-manager.ts
│   │   ├── storage-config-picker.ts
│   │   ├── workspace-config.ts
│   │   └── commands/
│   │       ├── constants.ts         # Storage commands
│   │       └── storage.ts
│   └── custom-instance/              # NEW: Prepared for future expansion
│       └── commands/
│           └── constants.ts         # Custom instance commands
├── jupyter/                          # Unchanged
├── auth/                             # Unchanged
├── common/                           # Unchanged
└── ...
```

### 2. Command Constants Reorganization

Commands are now organized by their domain:

**Server Commands** (`src/server/commands/constants.ts`):
- `MOUNT_SERVER`
- `REMOVE_SERVER`
- `RENAME_SERVER_ALIAS`
- `UPLOAD`
- `SIGN_OUT`
- Shared types: `Command`, `RegisteredCommand`

**Colab Commands** (`src/server/colab/commands/constants.ts`):
- `COLAB_TOOLBAR`
- `COLAB_SUBMENU`
- `SIGN_IN_VIEW_EXISTING`
- `AUTO_CONNECT`
- `NEW_SERVER`
- `OPEN_COLAB_WEB`
- `UPGRADE_TO_PRO`

**Storage Commands** (`src/server/storage/commands/constants.ts`):
- `CONFIGURE_STORAGE`
- `SYNC_STORAGE`

**Custom Instance Commands** (`src/server/custom-instance/commands/constants.ts`):
- `CUSTOM_INSTANCE`

### 3. Import Path Updates

All imports have been updated to reflect the new structure:
- `../colab/` → `../server/colab/`
- `../cloudstorage/` → `../server/storage/`
- Adjusted relative paths for files that moved deeper (e.g., `../common/` → `../../common/`)

### 4. Benefits

1. **Better Organization**: Clear separation between different server types (Colab, Custom Instance, etc.)
2. **Scalability**: Easy to add new server types in the future
3. **Logical Grouping**: Commands are grouped by their domain rather than all in one file
4. **Maintainability**: Related code is colocated, making it easier to find and modify

### 5. Future Expansion

The structure is now ready for:
- Custom instance support (placeholder already created)
- Additional server types
- Enhanced storage management features

## Migration Notes

### For Developers

If you have local branches or work in progress:

1. **Update your imports**: All imports from `colab/` should now point to `server/colab/`
2. **Update your imports**: All imports from `cloudstorage/` should now point to `server/storage/`
3. **Command constants**: Import server commands from `server/commands/constants`, colab commands from `server/colab/commands/constants`, etc.

### Known Issues

- Some lint errors related to import ordering remain (these are cosmetic)
- TypeScript compilation has some errors that need to be resolved by running a full build

## Next Steps

1. Run full test suite to ensure functionality
2. Fix any remaining TypeScript errors
3. Update documentation to reflect new structure