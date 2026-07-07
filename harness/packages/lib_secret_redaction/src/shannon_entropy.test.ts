import { calculateShannonEntropy } from './shannon_entropy';

describe('calculateShannonEntropy', () => {
  describe('edge cases', () => {
    it('should return 0 for empty string', () => {
      expect(calculateShannonEntropy('')).toBe(0);
    });

    it('should return 0 for single repeated character', () => {
      expect(calculateShannonEntropy('0')).toBe(0);
      expect(calculateShannonEntropy('aaaa')).toBe(0);
      expect(calculateShannonEntropy('zzzzzzzzzz')).toBe(0);
    });
  });

  describe('exact entropy values', () => {
    it('should return 1 for two equally distributed characters', () => {
      // 50% '0' and 50% '1' = 1 bit of entropy
      expect(calculateShannonEntropy('01')).toBe(1);
      expect(calculateShannonEntropy('0011')).toBe(1);
      expect(calculateShannonEntropy('00110011')).toBe(1);
    });

    it('should return 2 for four equally distributed characters', () => {
      // 25% each = 2 bits of entropy
      expect(calculateShannonEntropy('0123')).toBe(2);
    });

    it('should return 3 for eight equally distributed characters', () => {
      // 12.5% each = 3 bits of entropy
      expect(calculateShannonEntropy('01234567')).toBe(3);
    });

    it('should return 4 for sixteen equally distributed characters', () => {
      // 6.25% each = 4 bits of entropy
      expect(calculateShannonEntropy('0123456789abcdef')).toBe(4);
    });
  });

  describe('real-world examples from gitleaks tests', () => {
    it('should calculate entropy for high-entropy Discord API key', () => {
      // From gitleaks test: discord-api-key with entropy threshold 3.5
      // Expected from gitleaks test case: 3.7906237
      const highEntropySecret = 'e7322523fb86ed64c836a979cf8465fbd436378c653c1db38f9ae87bc62a6fd5';
      const entropy = calculateShannonEntropy(highEntropySecret);

      expect(entropy).toBeCloseTo(3.790623, 5);
    });
  });

  describe('varying character distributions', () => {
    it('should calculate entropy for mixed distribution', () => {
      // From gist example: '1223334444'
      // 1x'1', 2x'2', 3x'3', 4x'4'
      const entropy = calculateShannonEntropy('1223334444');
      expect(entropy).toBeCloseTo(1.8464, 4);
    });

    it('should have lower entropy with skewed distribution', () => {
      const balanced = calculateShannonEntropy('aabbcc'); // Equal distribution
      const skewed = calculateShannonEntropy('aaaabc'); // Skewed toward 'a'

      expect(balanced).toBeGreaterThan(skewed);
    });
  });

  describe('case sensitivity', () => {
    it('should treat uppercase and lowercase as different characters', () => {
      const lower = calculateShannonEntropy('abcd');
      const mixed = calculateShannonEntropy('aAbBcCdD');

      expect(mixed).toBeGreaterThan(lower);
    });

    it('should calculate same entropy for repeated case patterns', () => {
      const entropy1 = calculateShannonEntropy('AaAa');
      const entropy2 = calculateShannonEntropy('aAaA');

      expect(entropy1).toBe(entropy2);
    });
  });

  describe('special characters and whitespace', () => {
    it('should include special characters in entropy calculation', () => {
      const alphanumeric = calculateShannonEntropy('abc123');
      const withSpecial = calculateShannonEntropy('abc123!@#');

      expect(withSpecial).toBeGreaterThan(alphanumeric);
    });

    it('should include whitespace in entropy calculation', () => {
      const noSpace = calculateShannonEntropy('abcd');
      const withSpace = calculateShannonEntropy('a b c d');

      expect(withSpace).toBeGreaterThan(noSpace);
    });

    it('should handle unicode characters', () => {
      const ascii = calculateShannonEntropy('abcd');
      const unicode = calculateShannonEntropy('a🔑b🔐c🗝️d');

      expect(unicode).toBeGreaterThan(ascii);
    });
  });

  describe('length independence', () => {
    it('should have same entropy for repeated patterns of different lengths', () => {
      const short = calculateShannonEntropy('01');
      const long = calculateShannonEntropy('00110011');

      // Same distribution (50/50) should have same entropy regardless of length
      expect(short).toBe(long);
    });

    it('should calculate consistent entropy for scaled distributions', () => {
      const small = calculateShannonEntropy('abc');
      const large = calculateShannonEntropy('aabbcc');

      expect(small).toBe(large);
    });
  });
});
