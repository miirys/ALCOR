export const maskedPlaceholder = (input: string, isMasked?: boolean) => {
  return isMasked ? '*'.repeat(input.length) : input;
};
