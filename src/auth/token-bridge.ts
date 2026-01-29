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
   * @returns The authentication session if one exists, null otherwise.
   */
  async getSession(): Promise<AuthenticationSession | null> {
    log.debug('Attempting to get existing authentication session (silent)');
    try {
      // Silent mode: won't prompt user if no session exists
      const session = await this.vs.authentication.getSession(
        'google',
        REQUIRED_SCOPES,
        { silent: true },
      );
      if (session) {
        log.info(
          `Authentication session retrieved for account: ${session.account.label}`,
        );
      } else {
        log.debug('No existing authentication session found');
      }
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
    log.info(
      `Attempting to ensure authentication session (forceNew: ${String(forceNewSession)})`,
    );

    if (!this.isOfficialExtensionInstalled()) {
      log.error('Official Google Colab extension is not installed');
      const installed = await this.promptInstallOfficialExtension();
      if (!installed) {
        throw new Error(
          'Official Google Colab extension is required but not installed.',
        );
      }
    }

    try {
      log.debug('Requesting authentication session from VS Code...');
      // Note: Cannot use both createIfNone and forceNewSession together
      const session = await this.vs.authentication.getSession(
        'google',
        REQUIRED_SCOPES,
        forceNewSession ? { forceNewSession: true } : { createIfNone: true },
      );
      if (!session) {
        log.error('Authentication session returned undefined');
        throw new Error('session undefined');
      }
      log.info(
        `Authentication successful for account: ${session.account.label}`,
      );
      return session;
    } catch (error) {
      log.error('Failed to get or create session:', error);
      const errorMsg = error instanceof Error ? error.message : 'unknown error';
      throw new Error(`Failed to authenticate with Google: ${errorMsg}`);
    }
  }

  /**
   * Gets a fresh access token for the current session.
   *
   * This will automatically refresh the token if needed.
   * If no session exists, prompts the user to sign in.
   *
   * @returns The access token.
   * @throws Error if user cancels sign-in or authentication fails.
   */
  async getAccessToken(): Promise<string> {
    log.debug('Requesting access token');
    let session = await this.getSession();

    // If no session exists, prompt user to sign in
    if (!session) {
      log.info('No active session found, prompting user to sign in');
      session = await this.ensureSession();
    }

    log.debug('Access token retrieved successfully');
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
