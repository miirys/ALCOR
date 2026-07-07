import type { IssuableDiscussionNote } from '../../services/gitlab';
import { formatIssuableNotes } from './format_issueables';

describe('format_issuables', () => {
  describe('formatIssuableNotes', () => {
    it('formats notes chronologically', () => {
      const notes: IssuableDiscussionNote[] = [
        {
          body: 'Second comment',
          createdAt: '2024-01-02T00:00:00Z',
          author: { username: 'user2' },
        },
        {
          body: 'First comment',
          createdAt: '2024-01-01T00:00:00Z',
          author: { username: 'user1' },
        },
        {
          body: 'Third comment',
          createdAt: '2024-01-03T00:00:00Z',
          author: { username: 'user3' },
        },
      ];

      const result = formatIssuableNotes(notes, 1000);

      expect(result.indexOf('First comment')).toBeLessThan(result.indexOf('Second comment'));
      expect(result.indexOf('Second comment')).toBeLessThan(result.indexOf('Third comment'));
    });

    it('joins notes with double newlines', () => {
      const notes: IssuableDiscussionNote[] = [
        {
          body: 'First comment',
          createdAt: '2024-01-01T00:00:00Z',
          author: { username: 'user1' },
        },
        {
          body: 'Second comment',
          createdAt: '2024-01-02T00:00:00Z',
          author: { username: 'user2' },
        },
      ];

      const result = formatIssuableNotes(notes, 1000);

      expect(result).toBe('First comment\n\nSecond comment');
    });

    it('respects byte limit', () => {
      const emoji = '🦊'; // 4 bytes per emoji
      const notes: IssuableDiscussionNote[] = [
        {
          body: emoji.repeat(10), // 40 bytes
          createdAt: '2024-01-01T00:00:00Z',
          author: { username: 'user1' },
        },
        {
          body: emoji.repeat(10), // 40 bytes
          createdAt: '2024-01-02T00:00:00Z',
          author: { username: 'user2' },
        },
      ];

      const result = formatIssuableNotes(notes, 45); // Only enough space for first note + some bytes

      expect(result.length).toBeLessThanOrEqual(45);
      expect(result.split('\n\n')).toHaveLength(1); // Should only include first note
    });

    it('handles empty notes array', () => {
      const result = formatIssuableNotes([], 1000);

      expect(result).toBe('');
    });

    it('preserves note content exactly', () => {
      const notes: IssuableDiscussionNote[] = [
        {
          body: 'Comment with **markdown** and\nmultiple\nlines',
          createdAt: '2024-01-01T00:00:00Z',
          author: { username: 'user1' },
        },
      ];

      const result = formatIssuableNotes(notes, 1000);

      expect(result).toBe('Comment with **markdown** and\nmultiple\nlines');
    });

    it('handles notes at exactly the byte limit', () => {
      const notes: IssuableDiscussionNote[] = [
        {
          body: 'abc', // 3 bytes
          createdAt: '2024-01-01T00:00:00Z',
          author: { username: 'user1' },
        },
        {
          body: 'def', // 3 bytes
          createdAt: '2024-01-02T00:00:00Z',
          author: { username: 'user2' },
        },
      ];

      const result = formatIssuableNotes(notes, 3);

      expect(result).toBe('abc');
    });
  });
});
