/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { AuthenticationSession } from 'vscode';
import { log } from '../common/logging';

const OFFICIAL_EXTENSION_ID = 'google.colab';
const REQUIRED_SCOPES = [
  'profile',
  'email',
  'https://www.googleapis.com/auth/colaboratory',
] as const;

/**
 * TokenBridge provides access to authentication sessions from the
 * official Google Colab extension.
 *
 * This allows PER to leverage the official extension's OAuth
 * implementation without needing custom authentication.
 */
export class TokenBridge {
  constructor(private readonly vs: typeof vscode) {}

  /**
   * Checks if the official Google Colab extension is installed.
   *
   * @returns True if the extension is installed, false otherwise.
   */
  isOfficialExtensionInstalled(): boolean {
    const extension = this.vs.extensions.getExtension(OFFICIAL_EXTENSION_ID);
    return extension !== undefined;
  }

  /**
   * Prompts the user to install the official Google Colab extension.
   *
   * @returns True if user chose to install, false otherwise.
   */
  async promptInstallOfficialExtension(): Promise<boolean> {
    const install = 'Install Official Extension';
    const choice = await this.vs.window.showWarningMessage(
      'PER requires the official Google Colab extension for authentication.',
      install,
      'Cancel',
    );

    if (choice === install) {
      await this.vs.commands.executeCommand(
        'workbench.extensions.installExtension',
        OFFICIAL_EXTENSION_ID,
      );
      return true;
    }

    return false;
  }

  /**
   * Attempts to get an existing
   * authentication session from the official extension.
   *
   * This method will not prompt the user to sign in if no session exists.
   *
   * @returns The authentication session if one exists, null otherwise.
   */
  async getSession(): Promise<AuthenticationSession | null> {
    try {
      // Silent mode: won't prompt user if no session exists
      const session = await this.vs.authentication.getSession(
        'google',
        REQUIRED_SCOPES,
        { silent: true },
      );
      return session ?? null;
    } catch (error) {
      log.warn('Failed to get session from official extension:', error);
      return null;
    }
  }

  /**
   * Gets an authentication session, creating one if necessary.
   *
   * This will prompt the user to sign in via the official extension
   * if no session currently exists.
   *
   * @param forceNewSession - If true, forces creation
   * of a new session even if one exists.
   * @returns The authentication session.
   * @throws Error if user cancels the sign-in flow or if not installed.
   */
  async ensureSession(forceNewSession = false): Promise<AuthenticationSession> {
    if (!this.isOfficialExtensionInstalled()) {
      await this.promptInstallOfficialExtension();
      throw new Error(
        'Official Google Colab extension is required but not installed.',
      );
    }

    try {
      // Note: Cannot use both createIfNone and forceNewSession together
      const session = await this.vs.authentication.getSession(
        'google',
        REQUIRED_SCOPES,
        forceNewSession ? { forceNewSession: true } : { createIfNone: true },
      );
      if (!session) {
        throw new Error('session undefined');
      }
      return session;
    } catch (error) {
      log.error('Failed to get or create session:', error);
      throw new Error(
        `Failed to authenticate with Google: ${error instanceof Error ? error.message : 'unknown error'}`,
      );
    }
  }

  /**
   * Gets a fresh access token for the current session.
   *
   * This will automatically refresh the token if needed.
   *
   * @returns The access token.
   * @throws Error if no session exists or refresh fails.
   */
  async getAccessToken(): Promise<string> {
    const session = await this.getSession();
    if (!session) {
      throw new Error('No active authentication session.');
    }
    return session.accessToken;
  }

  /**
   * Listens for authentication session changes from the official extension.
   *
   * @param listener - Callback to invoke when sessions change.
   * @returns Disposable to stop listening.
   */
  onDidChangeSessions(
    listener: (e: vscode.AuthenticationSessionsChangeEvent) => void,
  ): vscode.Disposable {
    return this.vs.authentication.onDidChangeSessions((e) => {
      if (e.provider.id === 'google') {
        listener(e);
      }
    });
  }
}
