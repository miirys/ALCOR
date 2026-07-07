import { COMPONENT_TYPES } from '../schema';

import { deriveUiLogEvents } from './ui_log_events';

describe('deriveUiLogEvents', () => {
  it('returns a non-empty array for every known component type', () => {
    for (const type of COMPONENT_TYPES) {
      expect(deriveUiLogEvents(type).length).toBeGreaterThan(0);
    }
  });

  it('returns an empty array for an unknown component type', () => {
    // @ts-expect-error — testing runtime fallback
    expect(deriveUiLogEvents('SomeNewComponent')).toEqual([]);
  });
});
