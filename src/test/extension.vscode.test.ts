/**
 * @license
 * Copyright 2025 Google LLC
 * SPDX-License-Identifier: Apache-2.0
 */

import * as assert from 'assert';
import vscode from 'vscode';

describe('Extension', () => {
  it('should be present', () => {
    assert.ok(vscode.extensions.getExtension('beyond.per'));
  });

  it('should activate', async () => {
    const extension = vscode.extensions.getExtension('beyond.per');

    await extension?.activate();

    assert.strictEqual(extension?.isActive, true);
  });
});
