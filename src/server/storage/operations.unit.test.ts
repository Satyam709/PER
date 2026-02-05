/**
 * @license
 * Copyright 2026 Satyam
 * SPDX-License-Identifier: Apache-2.0
 */

import { expect } from 'chai';
import { sanitizePathForBisync } from './operations';

describe('sanitizePathForBisync', () => {
  it('replaces forward slashes with underscores', () => {
    expect(sanitizePathForBisync('/content/projects/test')).to.equal(
      'content_projects_test',
    );
  });

  it('replaces colons with underscores', () => {
    expect(sanitizePathForBisync('drive1:/per/testing')).to.equal(
      'drive1_per_testing',
    );
  });

  it('preserves hyphens in UUIDs', () => {
    expect(
      sanitizePathForBisync('/content/aca269fc-5f7d-473f-ab74-4440bb75cef9'),
    ).to.equal('content_aca269fc-5f7d-473f-ab74-4440bb75cef9');
  });

  it('removes leading underscores', () => {
    expect(sanitizePathForBisync('///multiple/leading')).to.equal(
      'multiple_leading',
    );
  });

  it('handles complex remote paths with colons and slashes', () => {
    expect(sanitizePathForBisync('drive1:/per/testing/t1')).to.equal(
      'drive1_per_testing_t1',
    );
  });

  it('produces correct state file pattern for local path', () => {
    const localPath = '/content/aca269fc-5f7d-473f-ab74-4440bb75cef9';
    const remotePath = 'drive1:/per/testing/t1';

    const sanitizedLocal = sanitizePathForBisync(localPath);
    const sanitizedRemote = sanitizePathForBisync(remotePath);
    const stateFile = `${sanitizedLocal}..${sanitizedRemote}.path1.lst`;

    // This should match the actual file format:
    // content_aca269fc-5f7d-473f-ab74-4440bb75cef9
    //   ..drive1_per_testing_t1.path1.lst
    expect(stateFile).to.equal(
      'content_aca269fc-5f7d-473f-ab74-4440bb75cef9..drive1_per_testing_t1.path1.lst',
    );
  });

  it('handles paths without special characters', () => {
    expect(sanitizePathForBisync('simple')).to.equal('simple');
  });

  it('handles paths with underscores', () => {
    expect(sanitizePathForBisync('path_with_underscores')).to.equal(
      'path_with_underscores',
    );
  });
});
