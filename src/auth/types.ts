/**
 * @license
 * Copyright 2026 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import { AuthenticationProviderAuthenticationSessionsChangeEvent } from 'vscode';

/**
 * An {@link Event} which fires when an authentication session is added,
 * removed, or changed.
 */
export interface AuthChangeEvent
  extends AuthenticationProviderAuthenticationSessionsChangeEvent {
  /**
   * True when there is a valid {@link AuthenticationSession} for the
   * authentication provider.
   */
  hasValidSession: boolean;
}
