/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode from 'vscode';
import { log } from '../common/logging';
import { MultiAccountManager, AccountProfile } from './multi-account-manager';
import { TokenBridge } from './token-bridge';

/**
 * Provides UI for managing and switching between multiple Google accounts.
 */
export class AccountSwitcher {
  private statusBarItem: vscode.StatusBarItem;

  constructor(
    private readonly vs: typeof vscode,
    private readonly accountManager: MultiAccountManager,
    private readonly tokenBridge: TokenBridge,
  ) {
    this.statusBarItem = vs.window.createStatusBarItem(
      vs.StatusBarAlignment.Right,
      100,
    );
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
        this.showAccountSwitcher(),
      ),
    );

    disposables.push(
      this.vs.commands.registerCommand('per.addAccount', () =>
        this.addAccount(),
      ),
    );

    disposables.push(
      this.vs.commands.registerCommand('per.manageAccounts', () =>
        this.manageAccounts(),
      ),
    );

    // Listen for auth changes from official extension
    disposables.push(
      this.tokenBridge.onDidChangeSessions(() => {
        void this.syncWithOfficialExtension();
      }),
    );

    disposables.push(this.statusBarItem);
    this.statusBarItem.show();

    return disposables;
  }

  /**
   * Shows the account switcher quick pick menu.
   */
  private async showAccountSwitcher(): Promise<void> {
    const profiles = this.accountManager.getAllProfiles();

    const items: (vscode.QuickPickItem & { profile?: AccountProfile })[] =
      profiles.map((p) => ({
        label: `$(account) ${p.displayName}`,
        description: p.email,
        detail: p.isActive ? '$(check) Active' : '',
        profile: p,
      }));

    items.push({
      label: '$(add) Add Another Account',
      description: 'Sign in with a different Google account',
    });

    items.push({
      label: '$(gear) Manage Accounts',
      description: 'View and remove accounts',
    });

    const selected = await this.vs.window.showQuickPick(items, {
      placeHolder: 'Select an account',
    });

    if (!selected) {
      return;
    }

    if (!selected.profile) {
      // Handle special items
      if (selected.label.includes('Add Another Account')) {
        await this.addAccount();
      } else if (selected.label.includes('Manage Accounts')) {
        await this.manageAccounts();
      }
      return;
    }

    // User selected a profile
    if (selected.profile.isActive) {
      this.vs.window.showInformationMessage(
        `Already using account: ${selected.profile.email}`,
      );
      return;
    }

    await this.switchToProfile(selected.profile);
  }

  /**
   * Prompts user to add a new account.
   */
  private async addAccount(): Promise<void> {
    const proceed = await this.vs.window.showInformationMessage(
      'To add a new account, you need to sign in via the official Google Colab extension. Continue?',
      'Continue',
      'Cancel',
    );

    if (proceed !== 'Continue') {
      return;
    }

    try {
      // Force new session to ensure user can pick a different account
      const session = await this.tokenBridge.ensureSession(true);
      const profile = await this.accountManager.updateFromSession(session);
      this.updateStatusBar();
      this.vs.window.showInformationMessage(`Added account: ${profile.email}`);
      log.info(`Added new account: ${profile.email}`);
    } catch (error) {
      const msg = error instanceof Error ? error.message : 'Unknown error';
      this.vs.window.showErrorMessage(`Failed to add account: ${msg}`);
      log.error('Failed to add account:', error);
    }
  }

  /**
   * Shows the account management interface.
   */
  private async manageAccounts(): Promise<void> {
    const profiles = this.accountManager.getAllProfiles();

    if (profiles.length === 0) {
      this.vs.window.showInformationMessage('No accounts configured.');
      return;
    }

    const items: (vscode.QuickPickItem & { profile: AccountProfile })[] =
      profiles.map((p) => ({
        label: `$(account) ${p.displayName}`,
        description: p.email,
        detail: p.isActive ? '$(check) Active' : '$(trash) Click to remove',
        profile: p,
      }));

    const selected = await this.vs.window.showQuickPick(items, {
      placeHolder: 'Select an account to remove (or ESC to cancel)',
    });

    if (!selected) {
      return;
    }

    if (selected.profile.isActive) {
      this.vs.window.showWarningMessage(
        'Cannot remove the active account. Switch to another account first.',
      );
      return;
    }

    const confirm = await this.vs.window.showWarningMessage(
      `Remove account ${selected.profile.email}?`,
      'Remove',
      'Cancel',
    );

    if (confirm === 'Remove') {
      await this.accountManager.removeProfile(selected.profile.id);
      this.vs.window.showInformationMessage(
        `Removed account: ${selected.profile.email}`,
      );
      log.info(`Removed account: ${selected.profile.email}`);
    }
  }

  /**
   * Switches to the specified account profile.
   */
  private async switchToProfile(profile: AccountProfile): Promise<void> {
    await this.accountManager.setActiveProfile(profile.id);
    this.updateStatusBar();

    const currentSession = await this.tokenBridge.getSession();

    if (currentSession?.account.id !== profile.email) {
      this.vs.window
        .showWarningMessage(
          `Switched to ${profile.email}. Sign in with this account via ` +
            `the official Google Colab extension.`,
          'Sign In',
        )
        .then(async (choice) => {
          if (choice === 'Sign In') {
            try {
              await this.tokenBridge.ensureSession(true);
            } catch (error) {
              log.error('Failed to sign in:', error);
            }
          }
        });
    } else {
      this.vs.window.showInformationMessage(
        `Switched to account: ${profile.email}`,
      );
      log.info(`Switched to account: ${profile.email}`);
    }
  }

  /**
   * Syncs the account manager state with the current session 
   * from official extension.
   */
  private async syncWithOfficialExtension(): Promise<void> {
    const session = await this.tokenBridge.getSession();
    if (session) {
      await this.accountManager.updateFromSession(session);
      this.updateStatusBar();
    }
  }

  /**
   * Updates the status bar to show the current active account.
   */
  private updateStatusBar(): void {
    const activeProfile = this.accountManager.getActiveProfile();

    if (activeProfile) {
      this.statusBarItem.text = `$(account) ${activeProfile.email}`;
      this.statusBarItem.tooltip = `Active Account: ${activeProfile.displayName}\nClick to switch`;
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
