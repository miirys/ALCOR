/**
 * Test helpers for unified input system tests
 */

import { Key } from '../../kitty-protocol';
import type { ParsedKey } from './types';

interface KittyKeyOverrides {
  name?: string;
  text?: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  super?: boolean;
  event?: 'press' | 'repeat' | 'release';
  caps_lock?: boolean;
  num_lock?: boolean;
  code?: { base: number };
}

/**
 * Create a Kitty Key with sensible defaults
 */
export function createKittyKey(overrides: KittyKeyOverrides = {}): Key {
  return Key.create({
    name: overrides.name ?? 'A',
    text: overrides.text ?? overrides.name?.toLowerCase() ?? 'a',
    ctrl: overrides.ctrl ?? false,
    alt: overrides.alt ?? false,
    shift: overrides.shift ?? false,
    super: overrides.super ?? false,
    event: overrides.event ?? 'press',
    caps_lock: overrides.caps_lock ?? false,
    num_lock: overrides.num_lock ?? false,
    ...(overrides.code && { code: overrides.code }),
  });
}

/**
 * Assert common ParsedKey properties
 */
export function expectParsedKey(
  result: ParsedKey | null,
  expected: Partial<ParsedKey> & { name: string },
): void {
  expect(result).not.toBeNull();
  expect(result?.name).toBe(expected.name);

  if (expected.ctrl !== undefined) expect(result?.ctrl).toBe(expected.ctrl);
  if (expected.meta !== undefined) expect(result?.meta).toBe(expected.meta);
  if (expected.shift !== undefined) expect(result?.shift).toBe(expected.shift);
  if (expected.source !== undefined) expect(result?.source).toBe(expected.source);
  if (expected.eventType !== undefined) expect(result?.eventType).toBe(expected.eventType);
}

/**
 * Assert ParsedKey is null (filtered input)
 */
export function expectFiltered(result: ParsedKey | null): void {
  expect(result).toBeNull();
}
