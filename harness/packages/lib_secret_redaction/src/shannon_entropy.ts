/**
 * Calculate the Shannon entropy of a string in bits per symbol.
 *
 * Shannon entropy measures the average amount of information (in bits) per symbol in a string.
 * Higher entropy indicates more randomness/unpredictability in the data.
 *
 * This implementation follows the algorithm used in gitleaks for secret detection:
 * https://github.com/gitleaks/gitleaks/blob/master/detect/utils.go#L112-134
 *
 * Formula: H(X) = -Σ p(x) * log₂(p(x))
 * where p(x) is the probability (frequency) of character x in the string
 *
 * @param data - The string to calculate entropy for
 * @returns The entropy value in bits per symbol (0 to ~log₂(unique characters))
 *
 * @see https://en.wiktionary.org/wiki/Shannon_entropy
 */
export function calculateShannonEntropy(data: string): number {
  if (!data || data.length === 0) {
    return 0;
  }

  // Build frequency map: count occurrences of each character
  const charCounts = new Map<string, number>();
  for (const char of data) {
    charCounts.set(char, (charCounts.get(char) || 0) + 1);
  }

  // Calculate entropy using Shannon's formula
  const invLength = 1.0 / data.length;
  let entropy = 0;

  charCounts.forEach((count) => {
    const freq = count * invLength; // Probability of this character
    entropy -= freq * Math.log2(freq);
  });

  return entropy;
}
