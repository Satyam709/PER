/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import vscode, { AuthenticationSession } from 'vscode';
import { log } from '../common/logging';

/**
 * Represents a user account profile in PER.
 */
export interface AccountProfile {
  /** Unique profile ID */
  id: string;
  /** User's email address */
  email: string;
  /** User's display name */
  displayName: string;
  /** Last time this account was used (timestamp) */
  lastUsed: number;
  /** Whether this is the currently active account */
  isActive: boolean;
}

/**
 * Storage structure for account profiles.
 */
interface AccountProfileStore {
  profiles: AccountProfile[];
  activeProfileId: string | null;
}

const STORAGE_KEY = 'per.accountProfiles';

/**
 * Manages multiple Google account profiles for PER.
 *
 * Allows users to maintain a list of accounts and switch between them.
 * Note: The official Colab extension only supports one account at a time,
 * so switching accounts requires the user to sign out and sign back in
 * via the official extension.
 */
export class MultiAccountManager {
  private store: AccountProfileStore = {
    profiles: [],
    activeProfileId: null,
  };

  constructor(private readonly globalState: vscode.Memento) {}

  /**
   * Initializes the multi-account manager by loading profiles from storage.
   */
  initialize(): void {
    const stored = this.globalState.get<AccountProfileStore>(STORAGE_KEY);
    if (stored) {
      this.store = stored;
      log.info(`Loaded ${String(this.store.profiles.length)} account profiles`);
    }
  }

  /**
   * Updates or adds a profile based on the current authentication session.
   *
   * @param session - The authentication session to 
   * create/update a profile from.
   * @returns The updated or created profile.
   */
  async updateFromSession(
    session: AuthenticationSession,
  ): Promise<AccountProfile> {
    const email = session.account.id;
    const displayName = session.account.label;

    let profile = this.store.profiles.find((p) => p.email === email);

    if (profile) {
      // Update existing profile
      profile.displayName = displayName;
      profile.lastUsed = Date.now();
      profile.isActive = true;
    } else {
      // Create new profile
      profile = {
        id: session.id,
        email,
        displayName,
        lastUsed: Date.now(),
        isActive: true,
      };
      this.store.profiles.push(profile);
      log.info(`Added new account profile: ${email}`);
    }

    // Mark all other profiles as inactive
    this.store.profiles.forEach((p) => {
      if (p.email !== email) {
        p.isActive = false;
      }
    });

    this.store.activeProfileId = profile.id;
    await this.persist();

    return profile;
  }

  /**
   * Gets the currently active account profile.
   *
   * @returns The active profile, or null if none.
   */
  getActiveProfile(): AccountProfile | null {
    if (!this.store.activeProfileId) {
      return null;
    }
    return (
      this.store.profiles.find((p) => p.id === this.store.activeProfileId) ??
      null
    );
  }

  /**
   * Gets all account profiles, sorted by last used (most recent first).
   *
   * @returns Array of account profiles.
   */
  getAllProfiles(): AccountProfile[] {
    return [...this.store.profiles].sort((a, b) => b.lastUsed - a.lastUsed);
  }

  /**
   * Sets the active account profile.
   *
   * Note: This only updates the local preference. The user must still
   * sign in via the official extension with the corresponding account.
   *
   * @param profileId - The profile ID to make active.
   * @returns True if profile was found and set active, false otherwise.
   */
  async setActiveProfile(profileId: string): Promise<boolean> {
    const profile = this.store.profiles.find((p) => p.id === profileId);
    if (!profile) {
      return false;
    }

    this.store.profiles.forEach((p) => {
      p.isActive = p.id === profileId;
    });

    profile.lastUsed = Date.now();
    this.store.activeProfileId = profileId;
    await this.persist();

    log.info(`Switched active profile to: ${profile.email}`);
    return true;
  }

  /**
   * Removes an account profile.
   *
   * @param profileId - The profile ID to remove.
   * @returns True if profile was found and removed, false otherwise.
   */
  async removeProfile(profileId: string): Promise<boolean> {
    const index = this.store.profiles.findIndex((p) => p.id === profileId);
    if (index === -1) {
      return false;
    }

    const profile = this.store.profiles[index];
    this.store.profiles.splice(index, 1);

    if (this.store.activeProfileId === profileId) {
      // If we removed the active profile, set the next most recent as active
      const sorted = this.getAllProfiles();
      this.store.activeProfileId = sorted.length > 0 ? sorted[0].id : null;
      if (sorted.length > 0) {
        sorted[0].isActive = true;
      }
    }

    await this.persist();
    log.info(`Removed account profile: ${profile.email}`);
    return true;
  }

  /**
   * Clears all account profiles.
   */
  async clearAll(): Promise<void> {
    this.store = {
      profiles: [],
      activeProfileId: null,
    };
    await this.persist();
    log.info('Cleared all account profiles.');
  }

  /**
   * Persists the profile store to global state.
   */
  private async persist(): Promise<void> {
    await this.globalState.update(STORAGE_KEY, this.store);
  }
}
