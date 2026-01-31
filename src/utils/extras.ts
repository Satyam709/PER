/**
 * Copyright 2026 Satyam OP
 *
 * Licensed under the Apache License, Version 2.0
 */

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
