/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { QuickPickItem } from 'vscode';
import { InputStep, MultiStepInput } from '../common/multi-step-quickpick';
import { StorageConfigManager } from './config';
import { RcloneManager } from './rclone-manager';

/**
 * Configuration method options for storage setup.
 */
enum ConfigMethod {
  FILE_PATH = 'file_path',
  UPLOAD = 'upload',
  DEFAULT = 'default',
}

interface ConfigMethodPick extends QuickPickItem {
  method: ConfigMethod;
}

interface RemotePick extends QuickPickItem {
  remoteName: string;
}

interface StorageConfigState {
  configMethod?: ConfigMethod;
  configPath?: string;
  remoteRootPath?: string;
  remoteName?: string;
}

/**
 * Multi-step picker for configuring cloud storage with rclone.
 */
export class StorageConfigPicker {
  private readonly rcloneManager: RcloneManager;

  constructor(
    private readonly vs: typeof vscode,
    private readonly storageConfigManager: StorageConfigManager,
  ) {
    this.rcloneManager = new RcloneManager();
  }

  /**
   * Prompt user through storage configuration flow.
   *
   * @returns True if configuration was successful, false if cancelled.
   */
  async prompt(): Promise<boolean> {
    const state: StorageConfigState = {};

    try {
      await MultiStepInput.run(this.vs, (input) =>
        this.promptForConfigMethod(input, state),
      );

      // If we got here, user completed the flow
      if (state.configPath && state.remoteRootPath) {
        await this.saveConfiguration(state);
        return true;
      }

      return false;
    } catch (error) {
      if (error instanceof this.vs.CancellationError) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Step 1: Choose how to provide rclone config.
   */
  private async promptForConfigMethod(
    input: MultiStepInput,
    state: StorageConfigState,
  ): Promise<InputStep | undefined> {
    const hasDefault = await this.rcloneManager.hasDefaultConfig();

    const items: ConfigMethodPick[] = [
      {
        method: ConfigMethod.FILE_PATH,
        label: '$(file) Provide config file path',
        description: 'Enter the path to your rclone.conf file',
      },
      {
        method: ConfigMethod.UPLOAD,
        label: '$(cloud-upload) Browse for config file',
        description: 'Select rclone.conf from file browser',
      },
    ];

    if (hasDefault) {
      items.unshift({
        method: ConfigMethod.DEFAULT,
        label: '$(check) Use default rclone config',
        description: this.rcloneManager.getDefaultConfigPath(),
      });
    }

    const pick = await input.showQuickPick({
      title: 'Configure Cloud Storage',
      step: 1,
      totalSteps: 3,
      items,
      placeholder: 'Choose how to provide rclone configuration',
    });

    state.configMethod = pick.method;

    return (input: MultiStepInput) => this.promptForConfigPath(input, state);
  }

  /**
   * Step 2: Get the config file path.
   */
  private async promptForConfigPath(
    input: MultiStepInput,
    state: StorageConfigState,
  ): Promise<InputStep | undefined> {
    if (state.configMethod === ConfigMethod.DEFAULT) {
      state.configPath = this.rcloneManager.getDefaultConfigPath();
    } else if (state.configMethod === ConfigMethod.UPLOAD) {
      // Use file picker
      const uris = await this.vs.window.showOpenDialog({
        canSelectFiles: true,
        canSelectFolders: false,
        canSelectMany: false,
        filters: {
          'Rclone Config': ['conf'],
          'All Files': ['*'],
        },
        title: 'Select rclone configuration file',
      });

      if (!uris || uris.length === 0) {
        throw new this.vs.CancellationError();
      }

      state.configPath = uris[0].fsPath;
    } else {
      // Manual path entry
      const defaultPath = this.rcloneManager.getDefaultConfigPath();
      const path = await input.showInputBox({
        title: 'Rclone Config Path',
        step: 2,
        totalSteps: 3,
        value: state.configPath ?? '',
        placeholder: defaultPath,
        prompt: 'Enter the full path to your rclone.conf file',
        validate: (value) => {
          if (!value) {
            return 'Path cannot be empty';
          }
          return '';
        },
      });

      state.configPath = defaultPath;

      if (path) {
        state.configPath = path;
      }
    }

    // Validate the config after getting the path
    if (!state.configPath) {
      throw new this.vs.CancellationError();
    }

    // Validate the config
    const validation = await this.rcloneManager.validateConfig(
      state.configPath,
    );
    if (!validation.valid) {
      await this.vs.window.showErrorMessage(
        `Invalid rclone config: ${validation.error ?? 'Something is wrong with config'}`,
      );
      throw new this.vs.CancellationError();
    }

    return (input: MultiStepInput) => this.promptForRemoteName(input, state);
  }

  /**
   * Step 2.5: Choose remote from available remotes.
   */
  private async promptForRemoteName(
    input: MultiStepInput,
    state: StorageConfigState,
  ): Promise<InputStep | undefined> {
    if (!state.configPath) {
      throw new Error('Config path not set');
    }

    const remoteNames = await this.rcloneManager.getRemoteNames(
      state.configPath,
    );

    if (remoteNames.length === 0) {
      await this.vs.window.showErrorMessage(
        'No remotes found in rclone config',
      );
      throw new this.vs.CancellationError();
    }

    const items: RemotePick[] = remoteNames.map((name) => ({
      remoteName: name,
      label: `$(cloud) ${name}`,
      description: 'Remote storage',
    }));

    const pick = await input.showQuickPick({
      title: 'Select Remote',
      step: 2,
      totalSteps: 3,
      items,
      placeholder: 'Choose which remote to use',
    });

    state.remoteName = pick.remoteName;

    return (input: MultiStepInput) => this.promptForRemotePath(input, state);
  }

  /**
   * Step 3: Specify remote root path.
   */
  private async promptForRemotePath(
    input: MultiStepInput,
    state: StorageConfigState,
  ): Promise<InputStep | undefined> {
    if (!state.configPath || !state.remoteName) {
      throw new Error('Config path or remote name not set');
    }

    const workspaceFolder = this.vs.workspace.workspaceFolders?.[0];
    const workspaceName = workspaceFolder?.name ?? 'project';
    const remoteName = state.remoteName ?? '';
    const suggestedPath = `${remoteName}:/projects/${workspaceName}`;

    const path = await input.showInputBox({
      title: 'Remote Root Path',
      step: 3,
      totalSteps: 3,
      value: state.remoteRootPath ?? '',
      placeholder: suggestedPath,
      prompt: 'Enter the remote folder path (e.g., drive:/projects/proj)',
      validate: (value) => {
        if (!value) {
          return 'Path cannot be empty';
        }
        return '';
      },
    });

    state.remoteRootPath = suggestedPath;
    if (path) {
      state.remoteRootPath = suggestedPath;
    }

    return undefined; // End of flow
  }

  /**
   * Save the configuration.
   */
  private async saveConfiguration(state: StorageConfigState): Promise<void> {
    if (!state.configPath || !state.remoteRootPath) {
      throw new Error('Incomplete configuration');
    }

    const workspaceId = this.storageConfigManager.getCurrentWorkspaceId();
    if (!workspaceId) {
      throw new Error('No workspace is open');
    }

    // Read and encode the config for storage
    const configContent = await this.rcloneManager.encodeConfigForTransmission(
      state.configPath,
    );

    await this.storageConfigManager.save({
      rcloneConfigPath: state.configPath,
      remoteRootPath: state.remoteRootPath,
      workspaceId,
      enabled: true,
      rcloneConfigContent: configContent,
    });

    await this.vs.window.showInformationMessage(
      `Storage configured: ${state.remoteRootPath}`,
    );
  }
}
