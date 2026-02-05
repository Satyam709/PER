/**
 * @license
 * Copyright 2025 Google LLC
 * Copyright 2026 Satyam
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Jupyter,
  JupyterServer,
  JupyterServerCollection,
  JupyterServerCommand,
  JupyterServerCommandProvider,
  JupyterServerProvider,
} from '@vscode/jupyter-extension';
import { CancellationToken, Disposable, Event } from 'vscode';
import vscode from 'vscode';
import { AuthChangeEvent } from '../auth/types';
import { LatestCancelable } from '../common/async';
import { log } from '../common/logging';
import { traceMethod } from '../common/logging/decorators';
import { InputFlowAction } from '../common/multi-step-quickpick';
import { ColabClient } from '../server/colab/client';
import {
  AUTO_CONNECT,
  COLAB_SUBMENU,
  Command,
  NEW_SERVER,
  OPEN_COLAB_WEB,
  SIGN_IN_VIEW_EXISTING,
} from '../server/colab/commands/constants';
import { openColabWeb } from '../server/colab/commands/external';
import { buildIconLabel, stripIconLabel } from '../server/colab/commands/utils';
import { ServerPicker } from '../server/colab/server-picker';
import { CUSTOM_INSTANCE } from '../server/custom-instance/commands/constants';
import { isUUID } from '../utils/uuid';
import { AssignmentChangeEvent, AssignmentManager } from './assignments';
import { NotebookServerTracker } from './notebook-server-tracker';

/**
 * Colab Jupyter server provider.
 *
 * Provides a static list of Colab Jupyter servers and resolves the connection
 * information using the provided config.
 */
export class ColabJupyterServerProvider
  implements
    JupyterServerProvider,
    JupyterServerCommandProvider,
    vscode.Disposable
{
  readonly onDidChangeServers: vscode.Event<void>;

  private readonly serverCollection: JupyterServerCollection;
  private readonly serverChangeEmitter: vscode.EventEmitter<void>;
  private isAuthorized = false;
  private authorizedListener: Disposable;
  private setServerContextRunner = new LatestCancelable(
    'hasAssignedServer',
    this.setHasAssignedServerContext.bind(this),
  );

  constructor(
    private readonly vs: typeof vscode,
    authEvent: Event<AuthChangeEvent>,
    private readonly assignmentManager: AssignmentManager,
    private readonly client: ColabClient,
    private readonly serverPicker: ServerPicker,
    jupyter: Jupyter,
    private readonly notebookTracker: NotebookServerTracker,
  ) {
    this.serverChangeEmitter = new this.vs.EventEmitter<void>();
    this.onDidChangeServers = this.serverChangeEmitter.event;
    this.authorizedListener = authEvent(this.handleAuthChange.bind(this));
    this.assignmentManager.onDidAssignmentsChange(
      this.handleAssignmentsChange.bind(this),
    );
    this.serverCollection = jupyter.createJupyterServerCollection(
      'per',
      'PER',
      this,
    );
    this.serverCollection.commandProvider = this;
    // TODO: Set `this.serverCollection.documentation` once docs exist.
  }

  dispose() {
    this.authorizedListener.dispose();
    this.serverCollection.dispose();
  }

  /**
   * Provides the list of Colab {@link JupyterServer | Jupyter Servers} which
   * can be used.
   *
   * Note: We intentionally return servers WITHOUT connectionInformation here.
   * This forces the Jupyter extension to call resolveJupyterServer when a
   * server is selected, which is our hook for tracking notebook-server
   * associations.
   */
  @traceMethod
  async provideJupyterServers(
    _token: CancellationToken,
  ): Promise<JupyterServer[]> {
    if (!this.isAuthorized) {
      return [];
    }
    const servers = await this.assignmentManager.getServers('extension');
    // Strip connectionInformation to force resolveJupyterServer to be called
    return servers.map((s) => ({
      id: s.id,
      label: s.label,
      // connectionInformation intentionally omitted
    }));
  }

  /**
   * Resolves the connection for the provided Colab {@link JupyterServer}.
   * Also tracks the notebook-server association for context-aware operations.
   */
  @traceMethod
  async resolveJupyterServer(
    server: JupyterServer,
    _token: CancellationToken,
  ): Promise<JupyterServer> {
    if (!isUUID(server.id)) {
      throw new Error('Unexpected server ID format, expected UUID');
    }
    log.debug(`resolving server ${server.label}`);
    const resolved = await this.assignmentManager.refreshConnection(server.id);
    // Track which notebook is using this server
    this.notebookTracker.trackConnection(resolved);
    return resolved;
  }

  /**
   * Returns a list of commands which are displayed in a section below
   * resolved servers.
   *
   * This gets invoked every time the value (what the user has typed into the
   * quick pick) changes. But we just return a static list which will be
   * filtered down by the quick pick automatically.
   */
  // TODO: Integrate rename server alias and remove server commands.
  @traceMethod
  async provideCommands(
    _value: string | undefined,
    _token: CancellationToken,
  ): Promise<JupyterServerCommand[]> {
    const commands: Command[] = [];
    // Only show the command to view existing servers if the user is not signed
    // in, but previously had assigned servers. Otherwise, the command is
    // redundant.
    if (
      !this.isAuthorized &&
      (await this.assignmentManager.getLastKnownAssignedServers()).length > 0
    ) {
      commands.push(SIGN_IN_VIEW_EXISTING);
    }
    // Show the new menu structure with Colab and Custom Instance
    commands.push(COLAB_SUBMENU, CUSTOM_INSTANCE);
    return commands.map((c) => ({
      label: buildIconLabel(c),
      description: c.description,
    }));
  }

  /**
   * Invoked when a command has been selected.
   *
   * @returns The newly assigned server or undefined if the command does not
   * create a new server.
   */
  // TODO: Consider popping a notification if the `openExternal` call fails.
  @traceMethod
  async handleCommand(
    command: JupyterServerCommand,
    _token: CancellationToken,
  ): Promise<JupyterServer | undefined> {
    const commandLabel = stripIconLabel(command.label);
    try {
      switch (commandLabel) {
        case SIGN_IN_VIEW_EXISTING.label:
          // The sign-in flow starts by prompting the user with an
          // application-level dialog to sign-in. Since it effectively takes
          // over the application, we fire and forget reconciliation to trigger
          // sign-in and navigate back.
          await this.assignmentManager.reconcileAssignedServers();
          throw InputFlowAction.back;
        case COLAB_SUBMENU.label:
          return await this.showColabSubmenu();
        case CUSTOM_INSTANCE.label:
          // Close the quick pick first, then show the message
          await this.vs.commands.executeCommand(
            'workbench.action.closeQuickOpen',
          );
          await this.vs.window.showInformationMessage(
            'Custom Instance feature is coming soon!',
          );
          // Throw CancellationError to properly abort kernel scanning
          throw new this.vs.CancellationError();
        default:
          throw new Error('Unexpected command');
      }
    } catch (e: unknown) {
      if (e === InputFlowAction.back) {
        // Navigate "back" by returning undefined.
        return;
      }

      // Which quick open? The open one... 😉. This is a little nasty, but
      // unfortunately it's the only known workaround while
      // https://github.com/microsoft/vscode-jupyter/issues/16469 is unresolved.
      //
      // Throwing a CancellationError is meant to dismiss the dialog, but it
      // doesn't. Additionally, if any other error is thrown while handling
      // commands, the quick pick is left spinning in the "busy" state.
      await this.vs.commands.executeCommand('workbench.action.closeQuickOpen');
      throw e;
    }
  }

  /**
   * Show the Colab submenu with available Colab options.
   */
  private async showColabSubmenu(): Promise<JupyterServer | undefined> {
    const colabCommands: Command[] = [AUTO_CONNECT, NEW_SERVER, OPEN_COLAB_WEB];

    const items = colabCommands.map((c) => ({
      label: buildIconLabel(c),
      description: c.description,
      command: c,
    }));

    const selected = await this.vs.window.showQuickPick(items, {
      title: 'PER > Colab',
      placeHolder: 'Select a Colab option',
    });

    if (!selected) {
      throw InputFlowAction.back;
    }

    // Handle the selected command
    switch (selected.command.label) {
      case AUTO_CONNECT.label:
        return await this.assignmentManager.latestOrAutoAssignServer();
      case NEW_SERVER.label:
        return await this.assignServer();
      case OPEN_COLAB_WEB.label:
        openColabWeb(this.vs);
        return;
      default:
        throw new Error('Unexpected command');
    }
  }

  private async assignServer(): Promise<JupyterServer> {
    log.info('User initiated server assignment');
    const tier = await this.client.getSubscriptionTier();
    log.debug(`User subscription tier: ${String(tier)}`);
    const serverType = await this.serverPicker.prompt(
      await this.assignmentManager.getAvailableServerDescriptors(tier),
    );
    if (!serverType) {
      log.debug('User cancelled server selection');
      throw new this.vs.CancellationError();
    }
    log.info(`User selected server type: ${serverType.label}`);
    return this.assignmentManager.assignServer(serverType);
  }

  /**
   * Sets a context key indicating whether or not the user has at least one
   * assigned server originating from VS Code. Set to false when not authorized
   * since we can't determine if servers exist or not.
   */
  private async setHasAssignedServerContext(
    signal?: AbortSignal,
  ): Promise<void> {
    const value = this.isAuthorized
      ? await this.assignmentManager.hasAssignedServer(signal)
      : false;
    await this.vs.commands.executeCommand(
      'setContext',
      'colab.hasAssignedServer',

      value,
    );
  }

  private handleAuthChange(e: AuthChangeEvent): void {
    if (this.isAuthorized === e.hasValidSession) {
      return;
    }
    this.isAuthorized = e.hasValidSession;
    this.serverChangeEmitter.fire();
    void this.setServerContextRunner.run();
  }

  private handleAssignmentsChange(e: AssignmentChangeEvent): void {
    const externalRemovals = e.removed.filter((s) => !s.userInitiated);
    for (const { server: s } of externalRemovals) {
      this.vs.window.showWarningMessage(
        `Server "${s.label}" has been removed, either outside of the extension or due to inactivity.`,
      );
    }
    this.serverChangeEmitter.fire();
    void this.setServerContextRunner.run();
  }
}
