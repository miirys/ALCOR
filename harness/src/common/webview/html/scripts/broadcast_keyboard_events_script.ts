export const broadcastKeyboardEventsScript = `
<script>
  const KEYBOARD_EVENT_COMMAND = 'kbd-event';

  (() => {
    if (window.parent === window) {
      return;
    }

    document.addEventListener('keydown', (e) => {
      const data = {
        altKey: e.altKey,
        code: e.code,
        ctrlKey: e.ctrlKey,
        isComposing: e.isComposing,
        key: e.key,
        location: e.location,
        metaKey: e.metaKey,
        repeat: e.repeat,
        shiftKey: e.shiftKey,
        // add iframe id that originated event
        sourceFrameId: window.frameElement?.id,
      };

      try {
        window.parent.postMessage({
          command: KEYBOARD_EVENT_COMMAND,
          data,
        }, '*');
      } catch (err) {
        // noop
      }
    });

    window.addEventListener('message', (e) => {
      // Forward keyboard events from nested iframes to parent
      if (e.data.command === KEYBOARD_EVENT_COMMAND) {
        window.parent.postMessage(e.data, '*');
      }
    });
  })();
</script>
`;
