/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { Jupyter } from '@vscode/jupyter-extension';
import vscode, { Disposable } from 'vscode';
import { AccountSwitcher } from './auth/account-switcher';
import { TokenBridge } from './auth/token-bridge';
import { ColabClient } from './colab/client';
import {
  COLAB_TOOLBAR,
  UPLOAD,
  MOUNT_SERVER,
  REMOVE_SERVER,
  SIGN_OUT,
} from './colab/commands/constants';
import { upload } from './colab/commands/files';
import { notebookToolbar } from './colab/commands/notebook';
import { mountServer, removeServer } from './colab/commands/server';
import { ConnectionRefreshController } from './colab/connection-refresher';
import { ConsumptionNotifier } from './colab/consumption/notifier';
import { ConsumptionPoller } from './colab/consumption/poller';
import { ServerKeepAliveController } from './colab/keep-alive';
import {
  deleteFile,
  download,
  newFile,
  newFolder,
  renameFile,
} from './colab/server-browser/commands';
import { ServerItem } from './colab/server-browser/server-item';
import { ServerTreeProvider } from './colab/server-browser/server-tree';
import { ServerPicker } from './colab/server-picker';
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
    ...registerCommands(tokenBridge, assignmentManager, fs),
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
    vscode.commands.registerCommand(COLAB_TOOLBAR.id, async () => {
      await notebookToolbar(vscode, assignmentManager);
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
