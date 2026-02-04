/**
 * Copyright 2026 Satyam
 *
 * Licensed under the Apache License, Version 2.0
 */

import stripAnsi from 'strip-ansi';

/**
 * convert protocol of a url from http to standard ws URL
 * @param url - to convert protocol
 */
export function convertProtocol(url: string): string {
  const parsed = new URL(url);
  if (parsed.protocol === 'http:') {
    parsed.protocol = 'ws:';
  } else if (parsed.protocol === 'https:') {
    parsed.protocol = 'wss:';
  }
  return parsed.toString();
}

/**
 * prettify the unreadable colab terminal stream
 * by striping off the ansi chars.
 * @param data - stream output data to operate on
 */
export function prettifyOutput(data: string): string {
  let strippedData = stripAnsi(data);
  strippedData = strippedData
    // eslint-disable-next-line no-control-regex
    .replace(/\x1b\[\?2004[hl]/g, '')
    .replace(/\r(?!\n)/g, '\n');

  return strippedData;
}
