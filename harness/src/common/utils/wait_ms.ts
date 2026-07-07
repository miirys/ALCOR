export const waitMs = (msToWait: number) =>
  new Promise((resolve) => {
    setTimeout(resolve, msToWait);
  });
