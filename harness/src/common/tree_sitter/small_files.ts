function getTotalNonEmptyLines(textContent: string): number {
  return textContent.split('\n').filter((line) => line.trim() !== '').length;
}

export function isSmallFile(textContent: string, totalCommentLines: number): boolean {
  const minLinesOfCode = 5; // threshold to determine whether a source code file is considered 'small'
  const totalNonEmptyLines = getTotalNonEmptyLines(textContent);
  return totalNonEmptyLines - totalCommentLines < minLinesOfCode;
}
