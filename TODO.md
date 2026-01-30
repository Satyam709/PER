# Storage Implementation - TODO

## Phase 1: Foundation (Configuration & Storage) - ✅ COMPLETED

### Create storage configuration data structures
- [x] Define `StorageConfig` interface in `src/jupyter/storage/config.ts`
- [x] Define Zod schema for validation
- [x] Add workspace configuration interface in `src/jupyter/storage/workspace-config.ts`

### Implement StorageConfigManager for persistence
- [x] Implement save/load from SecretStorage
- [x] Add validation methods
- [x] Add workspace association logic

### Create RcloneManager for config validation
- [x] Implement config file reading/parsing
- [x] Add remote name extraction
- [x] Add config validation methods
- [x] Add config encoding for transmission

### Add configuration options to package.json
- [x] Add `per.storage.enabled` setting
- [x] Add `per.storage.autoSync` setting
- [x] Add configuration schema

### Update ServerStorage schema
- [x] Add storage config fields to server schema
- [x] Update Zod validation schema
- [x] Add migration logic for existing servers (via optional field)

---

## Phase 2: UI & Menu System - IN PROGRESS

### Core UI Components
- [x] Created `StorageConfigPicker` with multi-step flow
- [x] Added storage commands (`configureStorage`, `syncStorage`)
- [x] Registered commands in `package.json` and `extension.ts`

### Remaining
- [ ] Menu restructuring in `provider.ts`
- [ ] Status bar implementation

---

## Phase 3: Server-Side Setup - PENDING

## Phase 4: Sync Integration - PENDING

## Phase 5: Testing & Polish - PENDING
