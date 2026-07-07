export const truncateToNCharacters = (text, n) => {
  if (text.length > n) {
    return `${text.slice(0, n)}…`;
  }
  return text;
};
