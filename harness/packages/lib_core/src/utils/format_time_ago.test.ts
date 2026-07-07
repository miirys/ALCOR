import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { formatTimeAgo } from './format_time_ago';

describe('formatTimeAgo', () => {
  const NOW = new Date('2026-02-23T12:00:00Z');

  const SECOND = 1000;
  const MINUTE = 60 * SECOND;
  const HOUR = 60 * MINUTE;
  const DAY = 24 * HOUR;
  const WEEK = 7 * DAY;
  const MONTH = 4.34524 * WEEK;
  const YEAR = 12 * MONTH;

  const ago = (ms: number) => new Date(NOW.getTime() - ms).toISOString();

  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(NOW);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('when the date is invalid', () => {
    it('returns the original string', () => {
      expect(formatTimeAgo('not-a-date')).toBe('not-a-date');
    });
  });

  describe('when useAbbreviations is false (default)', () => {
    it.each`
      label        | offset         | expected
      ${'seconds'} | ${30 * SECOND} | ${'30 seconds ago'}
      ${'minutes'} | ${MINUTE}      | ${'1 minute ago'}
      ${'hours'}   | ${HOUR}        | ${'1 hour ago'}
      ${'days'}    | ${DAY}         | ${'yesterday'}
      ${'weeks'}   | ${WEEK}        | ${'Last week'}
      ${'months'}  | ${2 * MONTH}   | ${'2 months ago'}
      ${'years'}   | ${2 * YEAR}    | ${'2 years ago'}
    `('formats $label ago as "$expected"', ({ offset, expected }) => {
      expect(formatTimeAgo(ago(offset as number))).toBe(expected);
    });
  });

  describe('when useAbbreviations is true', () => {
    it.each`
      label        | offset         | expected
      ${'seconds'} | ${30 * SECOND} | ${'30s ago'}
      ${'minutes'} | ${MINUTE}      | ${'1m ago'}
      ${'hours'}   | ${HOUR}        | ${'1h ago'}
      ${'days'}    | ${DAY}         | ${'1d ago'}
      ${'weeks'}   | ${WEEK}        | ${'1w ago'}
      ${'months'}  | ${2 * MONTH}   | ${'2mo ago'}
      ${'years'}   | ${2 * YEAR}    | ${'2y ago'}
    `('formats $label ago as "$expected"', ({ offset, expected }) => {
      expect(formatTimeAgo(ago(offset as number), true)).toBe(expected);
    });
  });
});
