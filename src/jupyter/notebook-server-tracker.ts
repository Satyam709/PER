/**
 * @license
 * Copyright 2026 Satyam
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode';
import { log } from '../common/logging';
import { AssignmentManager } from './assignments';
import { ColabAssignedServer } from './servers';

/**
 * Tracks the association between notebooks and their connected servers.
 *
 * This service maintains a mapping of which notebook is connected to which
 * server, enabling context-aware operations like storage sync based on the
 * currently active notebook.
 */
export class NotebookServerTracker implements vscode.Disposable {
  // TODO : map should be of a JupyterServer & TerminalProvider
  // consider abstracting later
  private readonly notebookToServer = new Map<string, ColabAssignedServer>();
  private readonly activeServerEmitter: vscode.EventEmitter<
    ColabAssignedServer | undefined
  >;
  private readonly disposables: vscode.Disposable[] = [];

  /**
   * Fires when the active notebook's server context changes.
   * Undefined when no notebook is active or active notebook isn't connected
   * to a tracked server.
   */
  readonly onDidChangeActiveServerContext: vscode.Event<
    ColabAssignedServer | undefined
  >;

  constructor(
    private readonly vs: typeof vscode,
    private readonly assignmentManager: AssignmentManager,
  ) {
    this.activeServerEmitter = new vs.EventEmitter<
      ColabAssignedServer | undefined
    >();
    this.onDidChangeActiveServerContext = this.activeServerEmitter.event;
    this.disposables.push(this.activeServerEmitter);

    // Listen to active notebook editor changes
    this.disposables.push(
      vs.window.onDidChangeActiveNotebookEditor(
        this.handleActiveNotebookChange.bind(this),
      ),
    );

    // Clean up mappings when servers are removed
    this.disposables.push(
      assignmentManager.onDidAssignmentsChange(
        this.handleAssignmentsChange.bind(this),
      ),
    );

    // Handle file renames to update tracking
    this.disposables.push(
      vs.workspace.onDidRenameFiles(this.handleFileRename.bind(this)),
    );

    log.debug('NotebookServerTracker initialized');
  }

  /**
   * Tracks that a notebook is connected to a server.
   * Called from resolveJupyterServer when a connection is established.
   *
   * Uses the currently active notebook editor to determine which notebook
   * is being connected.
   *
   * @param server - The server that was resolved for the notebook
   */
  trackConnection(server: ColabAssignedServer): void {
    const notebook = this.vs.window.activeNotebookEditor?.notebook;
    if (!notebook) {
      log.debug(
        'trackConnection called but no active notebook editor, skipping',
      );
      return;
    }

    const notebookUri = notebook.uri.toString();
    const existingServer = this.notebookToServer.get(notebookUri);

    if (existingServer?.id === server.id) {
      log.debug(
        `Notebook ${notebookUri} already tracked to server ${server.id}`,
      );
      return;
    }

    this.notebookToServer.set(notebookUri, server);
    log.info(
      `Tracked notebook ${notebookUri} -> server ${server.id} (${server.label})`,
    );

    // Fire event since the active notebook's server may have changed
    this.activeServerEmitter.fire(server);
  }

  /**
   * Gets the server for the currently active notebook.
   *
   * @returns The server connected to the active notebook, or undefined if:
   *   - No notebook is active
   *   - Active notebook isn't connected to a tracked server
   */
  getActiveServer(): ColabAssignedServer | undefined {
    const notebook = this.vs.window.activeNotebookEditor?.notebook;
    if (!notebook) {
      return undefined;
    }
    return this.notebookToServer.get(notebook.uri.toString());
  }

  /**
   * Gets the server for a specific notebook.
   *
   * @param notebookUri - The URI of the notebook
   * @returns The connected server or undefined
   */
  getServerForNotebook(
    notebookUri: vscode.Uri,
  ): ColabAssignedServer | undefined {
    return this.notebookToServer.get(notebookUri.toString());
  }

  /**
   * Gets all tracked notebook-server associations.
   * Useful for debugging.
   */
  getTrackedNotebooks(): Map<string, string> {
    const result = new Map<string, string>();
    for (const [uri, server] of this.notebookToServer.entries()) {
      result.set(uri, `${server.label} (${server.id})`);
    }
    return result;
  }

  private handleActiveNotebookChange(
    editor: vscode.NotebookEditor | undefined,
  ): void {
    if (!editor) {
      log.debug('Active notebook changed to undefined');
      this.activeServerEmitter.fire(undefined);
      return;
    }

    const notebookUri = editor.notebook.uri.toString();
    const server = this.notebookToServer.get(notebookUri);

    if (server) {
      log.debug(
        `Active notebook changed to ${notebookUri}, server: ${server.label}`,
      );
    } else {
      log.debug(`Active notebook changed to ${notebookUri}, no tracked server`);
    }

    this.activeServerEmitter.fire(server);
  }

  private handleAssignmentsChange(e: {
    removed: readonly { server: ColabAssignedServer }[];
  }): void {
    // Remove tracking entries for servers that were removed
    for (const { server } of e.removed) {
      const entriesToRemove: string[] = [];

      for (const [uri, tracked] of this.notebookToServer.entries()) {
        if (tracked.id === server.id) {
          entriesToRemove.push(uri);
        }
      }

      for (const uri of entriesToRemove) {
        this.notebookToServer.delete(uri);
        log.info(
          `Removed tracking for notebook ${uri} (server ${server.id} was removed)`,
        );
      }
    }

    // Fire event to update UI if active notebook's server was removed
    const activeServer = this.getActiveServer();
    this.activeServerEmitter.fire(activeServer);
  }

  private handleFileRename(e: vscode.FileRenameEvent): void {
    for (const { oldUri, newUri } of e.files) {
      const server = this.notebookToServer.get(oldUri.toString());
      if (server) {
        this.notebookToServer.delete(oldUri.toString());
        this.notebookToServer.set(newUri.toString(), server);
        log.info(
          `Updated tracking after file rename: ${oldUri.toString()} -> ${newUri.toString()}`,
        );
      }
    }
  }

  dispose(): void {
    for (const disposable of this.disposables) {
      disposable.dispose();
    }
    this.notebookToServer.clear();
    log.debug('NotebookServerTracker disposed');
  }
}
