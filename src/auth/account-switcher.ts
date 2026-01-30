/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode';
import { log } from '../common/logging';
import { TokenBridge } from './token-bridge';

/**
 * Provides UI for managing and switching between multiple Google accounts.
 */
export class AccountSwitcher {
  private statusBarItem: vscode.StatusBarItem;
  private activeSession: {
    name: string;
    email: string;
  };
  constructor(
    private readonly vs: typeof vscode,
    private readonly tokenBridge: TokenBridge,
  ) {
    this.statusBarItem = vs.window.createStatusBarItem(
      vs.StatusBarAlignment.Right,
      100,
    );
    this.activeSession = {
      name: '',
      email: '',
    };
    this.statusBarItem.command = 'per.switchAccount';
    this.updateStatusBar();
  }

  /**
   * Initializes the account switcher and registers commands.
   */
  initialize(): vscode.Disposable[] {
    const disposables: vscode.Disposable[] = [];
    disposables.push(
      this.vs.commands.registerCommand('per.switchAccount', () =>
        this.addAccount(),
      ),
    );

    // Listen for auth changes from official extension
    disposables.push(
      this.tokenBridge.onDidChangeSessions((e) => {
        log.debug('Session change event detected in AccountSwitcher:', {
          provider: e.provider.id,
        });
        void this.syncWithOfficialExtension();
      }),
    );

    disposables.push(this.statusBarItem);
    this.statusBarItem.show();

    // Perform initial sync to set the correct status bar state
    void this.syncWithOfficialExtension();

    return disposables;
  }

  /**
   * Prompts user to switch to a new account.
   */
  private async addAccount(): Promise<void> {
    log.info('User initiated account switch flow');

    const currentSession = await this.tokenBridge.getSession();
    const hasCurrentSession = !!currentSession;

    const proceed = await this.vs.window.showInformationMessage(
      hasCurrentSession
        ? `You are currently signed in as ${currentSession.account.id}. To switch accounts, you'll be signed out and prompted to sign in with a different account. Continue?`
        : 'To add an account, you need to sign in via the official Google Colab extension. Continue?',
      'Continue',
      'Cancel',
    );

    if (proceed !== 'Continue') {
      log.debug('User cancelled account switch flow');
      return;
    }

    try {
      // Sign out current account first if one exists
      if (hasCurrentSession) {
        log.debug('Signing out current account before switching...');
        await this.tokenBridge.signOut();
        // Give the auth provider a moment to process the sign-out
        await new Promise((resolve) => setTimeout(resolve, 500));
      }

      log.debug('Requesting new authentication session...');
      // Now sign in with new account
      const session = await this.tokenBridge.ensureSession(true);
      const userEmail = session.account.id;

      if (hasCurrentSession && userEmail === currentSession.account.id) {
        this.vs.window.showInformationMessage(
          `Signed in with the same account: ${userEmail}`,
        );
      } else {
        this.vs.window.showInformationMessage(
          `Successfully switched to: ${userEmail}`,
        );
      }

      log.debug(`Account switch completed: ${userEmail}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      log.error('Failed to switch account:', error);
      this.vs.window.showErrorMessage(
        `Failed to switch account: ${msg}. Make sure the official Google Colab extension is installed and active.`,
      );
    }
  }

  /**
   * Syncs the account manager state with the current session
   * from official extension.
   */
  private async syncWithOfficialExtension(): Promise<void> {
    log.debug('Syncing account switcher with official extension...');
    const session = await this.tokenBridge.getSession();
    if (session) {
      this.activeSession.email = session.account.id;
      this.activeSession.name = session.account.label;
      log.info('Account switcher synced with session:', {
        email: this.activeSession.email,
        name: this.activeSession.name,
      });
    } else {
      // Clear active session if no session exists
      this.activeSession.email = '';
      this.activeSession.name = '';
      log.info('Account switcher synced: no active session');
    }
    this.updateStatusBar();
  }

  /**
   * Updates the status bar to show the current active account.
   */
  private updateStatusBar(): void {
    const activeProfile = this.activeSession;

    if (activeProfile.email) {
      this.statusBarItem.text = `$(account) ${activeProfile.email}`;
      this.statusBarItem.tooltip = `Active Account: ${activeProfile.name}\nClick to switch`;
    } else {
      this.statusBarItem.text = '$(account) No Account';
      this.statusBarItem.tooltip = 'Click to sign in';
    }
  }

  /**
   * Disposes the account switcher.
   */
  dispose(): void {
    this.statusBarItem.dispose();
  }
}
