/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Jupyter } from '@vscode/jupyter-extension';
import vscode, { Disposable } from 'vscode';
import { AccountSwitcher } from './auth/account-switcher';
import { TokenBridge } from './auth/token-bridge';
import { CONFIG } from './colab-config';
import { initializeLogger, log } from './common/logging';
import { Toggleable } from './common/toggleable';
import { getPackageInfo } from './config/package-info';
import { AssignmentManager } from './jupyter/assignments';
import { ContentsFileSystemProvider } from './jupyter/contents/file-system';
import { JupyterConnectionManager } from './jupyter/contents/sessions';
import { getJupyterApi } from './jupyter/jupyter-extension';
import { ColabJupyterServerProvider } from './jupyter/provider';
import { ServerStorage } from './jupyter/storage';
import { ColabClient } from './server/colab/client';
import {
  COLAB_TOOLBAR,
  COLAB_SUBMENU,
} from './server/colab/commands/constants';
import { upload } from './server/colab/commands/files';
import {
  notebookToolbar,
  colabSubmenu,
  customInstanceSubmenu,
} from './server/colab/commands/notebook';
import { mountServer, removeServer } from './server/colab/commands/server';
import { ConnectionRefreshController } from './server/colab/connection-refresher';
import { ConsumptionNotifier } from './server/colab/consumption/notifier';
import { ConsumptionPoller } from './server/colab/consumption/poller';
import { ServerKeepAliveController } from './server/colab/keep-alive';
import {
  deleteFile,
  download,
  newFile,
  newFolder,
  renameFile,
} from './server/colab/server-browser/commands';
import { ServerItem } from './server/colab/server-browser/server-item';
import { ServerTreeProvider } from './server/colab/server-browser/server-tree';
import { ServerPicker } from './server/colab/server-picker';
import {
  UPLOAD,
  MOUNT_SERVER,
  REMOVE_SERVER,
  SIGN_OUT,
} from './server/commands/constants';
import {
  CUSTOM_INSTANCE,
} from './server/custom-instance/commands/constants';
import {
  CONFIGURE_STORAGE,
  SYNC_STORAGE,
} from './server/storage/commands/constants';
import {
  configureStorage,
  setupStorageOnServer,
  syncStorage,
  validateStorageSetup,
} from './server/storage/commands/storage';
import { StorageConfigManager } from './server/storage/config';
import { StorageStatusBar } from './server/storage/status-bar';
import { StorageIntegration } from './server/storage/storage-integration';
import { ExtensionUriHandler } from './system/uri';

// Called when the extension is activated.
export async function activate(context: vscode.ExtensionContext) {
  const logging = initializeLogger(vscode, context.extensionMode);
  log.info('PER extension activation started');

  const jupyter = await getJupyterApi(vscode);
  logEnvInfo(jupyter);

  const uriHandler = new ExtensionUriHandler(vscode);
  const uriHandlerRegistration = vscode.window.registerUriHandler(uriHandler);
  log.debug('URI handler registered');

  // Initialize authentication through the official Google Colab extension
  log.info('Initializing TokenBridge for authentication');
  const tokenBridge = new TokenBridge(vscode);
  const isExtInstalled = tokenBridge.isOfficialExtensionInstalled();
  log.info(
    `Official Google Colab extension installed: ${String(isExtInstalled)}`,
  );

  const accountSwitcher = new AccountSwitcher(vscode, tokenBridge);

  // Create an auth event adapter that converts TokenBridge events
  // to AuthChangeEvent format
  const createAuthEvent = (
    event: vscode.EventEmitter<import('./auth/types').AuthChangeEvent>,
  ) => {
    return tokenBridge.onDidChangeSessions(() => {
      void (async () => {
        const session = await tokenBridge.getSession();
        event.fire({
          added: [],
          removed: [],
          changed: session ? [session] : [],
          hasValidSession: !!session,
        });
      })();
    });
  };
  const authEventEmitter = new vscode.EventEmitter<
    import('./auth/types').AuthChangeEvent
  >();
  const authEventDisposable = createAuthEvent(authEventEmitter);
  const authEvent = authEventEmitter.event;
  const colabClient = new ColabClient(
    new URL(CONFIG.ColabApiDomain),
    new URL(CONFIG.ColabGapiDomain),
    () => tokenBridge.getAccessToken(),
  );
  const serverStorage = new ServerStorage(vscode, context.secrets);
  const storageConfigManager = new StorageConfigManager(
    vscode,
    context.secrets,
    context.workspaceState,
  );
  const storageIntegration = new StorageIntegration(
    vscode,
    storageConfigManager,
  );
  const assignmentManager = new AssignmentManager(
    vscode,
    colabClient,
    serverStorage,
  );
  const serverProvider = new ColabJupyterServerProvider(
    vscode,
    authEvent,
    assignmentManager,
    colabClient,
    new ServerPicker(vscode, assignmentManager),
    jupyter.exports,
  );
  const jupyterConnections = new JupyterConnectionManager(
    vscode,
    authEvent,
    assignmentManager,
  );
  const fs = new ContentsFileSystemProvider(vscode, jupyterConnections);
  const serverTreeView = new ServerTreeProvider(
    assignmentManager,
    authEvent,
    assignmentManager.onDidAssignmentsChange,
    fs.onDidChangeFile,
  );
  const connections = new ConnectionRefreshController(assignmentManager);
  const keepServersAlive = new ServerKeepAliveController(
    vscode,
    colabClient,
    assignmentManager,
  );
  const consumptionMonitor = watchConsumption(colabClient);
  
  // Create storage status bar
  const storageStatusBar = new StorageStatusBar(
    vscode,
    assignmentManager,
    storageIntegration,
    storageConfigManager,
  );

  // Create a simple toggle controller for auth-dependent features
  const whileAuthorizedToggle = authEvent((e) => {
    // cspell:ignore toggleables
    const toggleables = [
      connections,
      keepServersAlive,
      consumptionMonitor.toggle,
    ];
    if (e.hasValidSession) {
      toggleables.forEach((t) => {
        t.on();
      });
      // Initialize executors for existing servers when authorized
      void assignmentManager.initializeExecutors().catch((error: unknown) => {
        log.error('Failed to initialize executors on auth change:', error);
      });
    } else {
      toggleables.forEach((t) => {
        t.off();
      });
    }
  });

  // Initialize auth state
  void (async () => {
    const session = await tokenBridge.getSession();
    authEventEmitter.fire({
      added: [],
      removed: [],
      changed: session ? [session] : [],
      hasValidSession: !!session,
    });
  })();
  log.info('Registering filesystem provider with scheme: per');
  const disposeFs = vscode.workspace.registerFileSystemProvider('per', fs, {
    isCaseSensitive: true,
  });
  log.info('Filesystem provider registered successfully');
  const disposeTreeView = vscode.window.createTreeView('per-servers-view', {
    treeDataProvider: serverTreeView,
  });

  context.subscriptions.push(
    logging,
    uriHandler,
    uriHandlerRegistration,
    authEventEmitter,
    authEventDisposable,
    ...accountSwitcher.initialize(),
    assignmentManager,
    serverProvider,
    jupyterConnections,
    disposeFs,
    disposeTreeView,
    connections,
    keepServersAlive,
    ...consumptionMonitor.disposables,
    whileAuthorizedToggle,
    storageIntegration,
    storageStatusBar,
    ...registerCommands(
      tokenBridge,
      assignmentManager,
      fs,
      storageConfigManager,
      storageIntegration,
    ),
    ...setupStorageIntegration(
      vscode,
      assignmentManager,
      storageIntegration,
      storageConfigManager,
    ),
  );

  log.info('PER extension activated successfully');
}

function logEnvInfo(jupyter: vscode.Extension<Jupyter>) {
  log.info(`${vscode.env.appName}: ${vscode.version}`);
  log.info(`Remote: ${vscode.env.remoteName ?? 'N/A'}`);
  log.info(`App Host: ${vscode.env.appHost}`);
  const jupyterVersion = getPackageInfo(jupyter).version;
  log.info(`Jupyter extension version: ${jupyterVersion}`);
}

/**
 * Sets up consumption monitoring.
 *
 * If the user has already signed in, starts immediately. Otherwise, waits until
 * the user signs in.
 */
function watchConsumption(colab: ColabClient): {
  toggle: Toggleable;
  disposables: Disposable[];
} {
  const disposables: Disposable[] = [];
  const poller = new ConsumptionPoller(vscode, colab);
  disposables.push(poller);
  const notifier = new ConsumptionNotifier(
    vscode,
    colab,
    poller.onDidChangeCcuInfo,
  );
  disposables.push(notifier);

  return { toggle: poller, disposables };
}

function registerCommands(
  _tokenBridge: TokenBridge,
  assignmentManager: AssignmentManager,
  fs: ContentsFileSystemProvider,
  storageConfigManager: StorageConfigManager,
  storageIntegration: StorageIntegration,
): Disposable[] {
  return [
    vscode.commands.registerCommand(SIGN_OUT.id, async () => {
      // Guide user to sign out through the official extension
      const signOut = 'Sign Out';
      const choice = await vscode.window.showInformationMessage(
        'To sign out, please use the Accounts menu in VS Code to sign out of your Google account.',
        signOut,
      );
      if (choice === signOut) {
        await vscode.commands.executeCommand('workbench.action.accounts');
      }
    }),
    // TODO: Register the rename server alias command once rename is reflected
    // in the recent kernels list. See https://github.com/microsoft/vscode-jupyter/issues/17107.
    vscode.commands.registerCommand(
      MOUNT_SERVER.id,
      async (withBackButton?: boolean) => {
        await mountServer(vscode, assignmentManager, fs, withBackButton);
      },
    ),
    vscode.commands.registerCommand(
      REMOVE_SERVER.id,
      async (withBackButton?: boolean) => {
        await removeServer(vscode, assignmentManager, withBackButton);
      },
    ),
    vscode.commands.registerCommand(
      UPLOAD.id,
      async (uri: vscode.Uri, uris?: vscode.Uri[]) => {
        await upload(vscode, assignmentManager, uri, uris);
      },
    ),
    vscode.commands.registerCommand(CONFIGURE_STORAGE.id, async () => {
      await configureStorage(vscode, storageConfigManager);
    }),
    vscode.commands.registerCommand(SYNC_STORAGE.id, async () => {
      await syncStorage(vscode, assignmentManager, storageIntegration);
    }),
    vscode.commands.registerCommand('per.storage.setupServer', async () => {
      await setupStorageOnServer(vscode, assignmentManager, storageIntegration);
    }),
    vscode.commands.registerCommand('per.storage.syncNow', async () => {
      await syncStorage(vscode, assignmentManager, storageIntegration);
    }),
    vscode.commands.registerCommand('per.storage.validateSetup', async () => {
      await validateStorageSetup(
        vscode,
        assignmentManager,
        storageIntegration,
      );
    }),
    vscode.commands.registerCommand(COLAB_TOOLBAR.id, async () => {
      await notebookToolbar(vscode, assignmentManager);
    }),
    vscode.commands.registerCommand(COLAB_SUBMENU.id, async () => {
      await colabSubmenu(vscode, assignmentManager);
    }),
    vscode.commands.registerCommand(CUSTOM_INSTANCE.id, async () => {
      await customInstanceSubmenu(vscode, assignmentManager);
    }),
    vscode.commands.registerCommand(
      'per.newFile',
      (contextItem: ServerItem) => {
        void newFile(vscode, contextItem);
      },
    ),
    vscode.commands.registerCommand(
      'per.newFolder',
      (contextItem: ServerItem) => {
        void newFolder(vscode, contextItem);
      },
    ),
    vscode.commands.registerCommand(
      'per.download',
      (contextItem: ServerItem) => {
        void download(vscode, contextItem);
      },
    ),
    vscode.commands.registerCommand(
      'per.renameFile',
      (contextItem: ServerItem) => {
        void renameFile(vscode, contextItem);
      },
    ),
    vscode.commands.registerCommand(
      'per.deleteFile',
      (contextItem: ServerItem) => {
        void deleteFile(vscode, contextItem);
      },
    ),
  ];
}

/**
 * Setup automatic storage integration on server assignment changes.
 */
function setupStorageIntegration(
  vs: typeof vscode,
  assignmentManager: AssignmentManager,
  storageIntegration: StorageIntegration,
  storageConfigManager: StorageConfigManager,
): Disposable[] {
  const disposables: Disposable[] = [];

  // Auto-setup storage when servers are added (if enabled)
  const assignmentListener = assignmentManager.onDidAssignmentsChange((e) => {
    void (async () => {
      // Check if auto-sync is enabled
      const autoSync = vs.workspace
        .getConfiguration('per.storage')
        .get<boolean>('autoSync', true);

      if (!autoSync) {
        return;
      }

      const isConfigured = await storageConfigManager.isConfigured();
      if (!isConfigured) {
        return;
      }

      // Setup storage on newly added servers
      for (const server of e.added) {
        const executor = assignmentManager.getExecutor(server.id);
        if (executor) {
          log.info(`Auto-setting up storage on server: ${server.id}`);
          const result = await storageIntegration.setupOnServer(
            server,
            executor,
          );

          if (result.success) {
            log.info(`Storage setup successful on server: ${server.id}`);
          } else {
            const errorMsg = result.error ?? result.message ?? 'Unknown error';
            log.warn(
              `Storage setup failed on server ${server.id}: ${errorMsg}`,
            );
          }
        }
      }

      // Clean up storage status for removed servers
      for (const { server } of e.removed) {
        storageIntegration.removeServer(server.id);
      }
    })();
  });

  disposables.push(assignmentListener);

  // Update context keys based on storage status
  const statusListener = storageIntegration.onDidChangeStatus(() => {
    void (async () => {
      const isConfigured = await storageConfigManager.isConfigured();
      await vs.commands.executeCommand(
        'setContext',
        'per.hasStorageConfigured',
        isConfigured,
      );
    })();
  });

  disposables.push(statusListener);

  // Initialize context key
  void (async () => {
    const isConfigured = await storageConfigManager.isConfigured();
    await vs.commands.executeCommand(
      'setContext',
      'per.hasStorageConfigured',
      isConfigured,
    );
  })();

  return disposables;
}
