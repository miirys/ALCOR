/**
 * Stable identifiers for the actions resolved by the centralized input keymap.
 *
 * Resolution is keyed by these ids (not by handler registration order), so a
 * remounted component re-registers the same id and ordering never matters.
 */
export type InputAction =
  | 'dropdown.next'
  | 'dropdown.prev'
  | 'dropdown.apply'
  | 'dropdown.applyOrSubmit'
  | 'dropdown.close'
  | 'onboarding.prev'
  | 'onboarding.next'
  | 'onboarding.run'
  | 'agent.cycle'
  | 'input.submit'
  | 'input.clear'
  | 'queue.cancel'
  | 'stream.cancel'
  | 'history.open'
  | 'expand.toggle'
  | 'app.exit';
