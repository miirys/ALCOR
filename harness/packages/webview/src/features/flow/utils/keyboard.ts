const IS_MAC =
  (navigator as Navigator & { userAgentData?: { platform: string } }).userAgentData?.platform ===
    'macOS' || /mac/i.test(navigator.userAgent);

/** Returns true if the event target is a text input, textarea, or contenteditable element. */
export function isTextInputTarget(event: KeyboardEvent): boolean {
  const target = event.target as HTMLElement;
  return target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
}

/** Returns true if the platform modifier key (⌘ on Mac, Ctrl elsewhere) is pressed. */
export function hasModKey(event: KeyboardEvent): boolean {
  return IS_MAC ? event.metaKey : event.ctrlKey;
}
