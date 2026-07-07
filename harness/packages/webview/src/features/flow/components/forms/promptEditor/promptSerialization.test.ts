import { describe, it, expect } from 'vitest';
import { serializeDoc, deserializeDoc } from './promptSerialization';

describe('promptSerialization', () => {
  describe('serializeDoc', () => {
    it('serializes plain text', () => {
      const doc = deserializeDoc('Hello world');
      expect(serializeDoc(doc)).toBe('Hello world');
    });

    it('serializes merge fields using varName, not path', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'Fix: ' },
              {
                type: 'mergeField',
                attrs: {
                  path: 'context:abc-123.final_answer',
                  varName: 'final_answer',
                  displayLabel: 'My Agent → Final Answer',
                  sourceNodeType: 'agent',
                  status: 'valid',
                },
              },
            ],
          },
        ],
      };
      expect(serializeDoc(doc)).toBe('Fix: {{final_answer}}');
    });

    it('falls back to path when varName is empty', () => {
      const doc = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              {
                type: 'mergeField',
                attrs: {
                  path: 'goal',
                  varName: '',
                  displayLabel: '',
                  sourceNodeType: '',
                  status: 'unknown',
                },
              },
            ],
          },
        ],
      };
      expect(serializeDoc(doc)).toBe('{{goal}}');
    });

    it('preserves hard breaks as newlines', () => {
      const doc = deserializeDoc('line1\nline2');
      expect(serializeDoc(doc)).toBe('line1\nline2');
    });

    it('preserves paragraph breaks as double newlines', () => {
      const doc = deserializeDoc('para1\n\npara2');
      expect(serializeDoc(doc)).toBe('para1\n\npara2');
    });

    it('handles empty string', () => {
      expect(serializeDoc(deserializeDoc(''))).toBe('');
    });
  });

  describe('deserializeDoc', () => {
    it('round-trips plain text', () => {
      const text = 'You are a helpful assistant.';
      expect(serializeDoc(deserializeDoc(text))).toBe(text);
    });

    it('round-trips merge field tokens', () => {
      const text = 'Analyze {{goal}} and report on {{status}}';
      const doc = deserializeDoc(text);
      const reserialized = serializeDoc(doc);
      expect(reserialized).toBe(text);
    });

    it('assigns unknown status and varName = path when no hydrate callback', () => {
      const doc = deserializeDoc('{{goal}}');
      const mergeField = doc.content![0]!.content![0]!;
      expect(mergeField.type).toBe('mergeField');
      expect(mergeField.attrs!.varName).toBe('goal');
      expect(mergeField.attrs!.path).toBe('goal');
      expect(mergeField.attrs!.status).toBe('unknown');
    });

    it('applies hydrate callback to resolve merge field attrs', () => {
      const doc = deserializeDoc('{{goal}}', (varName) => ({
        path: 'context:goal',
        varName,
        displayLabel: 'Workflow Goal',
        sourceNodeType: 'workflow',
        status: 'valid' as const,
      }));
      const mergeField = doc.content![0]!.content![0]!;
      expect(mergeField.attrs!.path).toBe('context:goal');
      expect(mergeField.attrs!.displayLabel).toBe('Workflow Goal');
      expect(mergeField.attrs!.status).toBe('valid');
    });
  });

  describe('round-trip: serialize → deserialize → serialize', () => {
    it('preserves a mixed prompt with text and merge fields', () => {
      const original =
        'You are a {{role}} assistant.\n\nHelp with {{goal}} using the result: {{final_answer}}';
      const doc = deserializeDoc(original);
      expect(serializeDoc(doc)).toBe(original);
    });

    it('preserves empty prompt', () => {
      expect(serializeDoc(deserializeDoc(''))).toBe('');
    });
  });
});
