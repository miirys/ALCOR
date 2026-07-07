export const execCommandScript = `
<script>
  window.addEventListener('message', (e) => {
    if (e.data.command === 'execCommand') {
      let command, sourceFrameId;

      // if data is of string type, its data prop represents command to run
      // if its an object, it should contain sourceFrameId to forward command to
      if (typeof e.data.data === 'string') {
        command = e.data.data;
        sourceFrameId = null;
      } else {
        command = e.data.data.command;
        sourceFrameId = e.data.data.sourceFrameId;
      }

      if (sourceFrameId) {
        // Try to find child iframe with this specific ID
        // if child iframe exists, forward command to it
        // otherwise run command in current document
        const targetFrame = document.querySelector('iframe#' + sourceFrameId);

        if (targetFrame) {
          try {
            targetFrame.contentWindow.postMessage(e.data, '*');
            return;
          } catch (err) {}
        }
      }

      document.execCommand(command);
    }
  });
</script>
`;
