/**
 * Converts PCRE-style regex patterns to JavaScript-compatible regex.
 *
 * Gitleaks rules use PCRE (Perl Compatible Regular Expressions) which has more features
 * than JavaScript regex. This function performs best-effort conversion of common PCRE
 * constructs to JavaScript equivalents.
 *
 * Supported conversions:
 * - `(?i)` - Global case-insensitive flag → JavaScript `i` flag
 * - `(?s:...)` - Dotall mode groups → Converts `.` to `[\s\S]` (matches newlines)
 * - `(?i:...)` - Case-insensitive groups → Expands letters to `[aA][bB][cC]`
 * - `\x60` - Hex escapes → Converted to literal characters
 * - `(?P<name>...)` - Named capture groups → Converted to JavaScript syntax `(?<name>...)`
 *
 * Known limitations (not converted):
 * - `(?-i:...)` - Case-sensitive groups in case-insensitive patterns
 *     - Currently converted to `(?:...)` but loses case-sensitivity distinction
 *     - Affects ~15 gitleaks rules. The pattern will still match, but may be overly permissive
 * - Atomic groups `(?>...)`
 * - Possessive quantifiers `*+`, `++`, `?+`
 * - Conditional patterns `(?(condition)yes|no)`
 *
 * @returns An object with the converted pattern and whether it should be case-insensitive
 */
export const convertToJavaScriptRegex = (
  pcreRegex: string,
): { pattern: string; caseInsensitive: boolean } => {
  // Check if the pattern starts with (?i) for case-insensitive matching
  const caseInsensitive = pcreRegex.startsWith('(?i)');

  // Remove the (?i) flag (case-insensitive) if present
  let jsRegex = pcreRegex.replace(/\(\?i\)/g, '');

  // Replace \x60 escape with a backtick
  jsRegex = jsRegex.replace(/\\x60/g, '`');

  // Handle PCRE dotall mode groups (?s:...)
  // In PCRE, (?s:...) makes . match newlines within that group
  // In JavaScript, we convert . to [\s\S] within these groups
  jsRegex = convertDotallGroups(jsRegex);

  // Handle PCRE case-sensitive groups (?-i:...) BEFORE handling case-insensitive groups
  // This is important because some patterns have (?i:...(?-i:...)...) nesting
  // Convert to non-capturing groups but preserve the content
  jsRegex = jsRegex.replace(/\(\?-i:/g, '(?:');

  // Handle PCRE case-insensitive groups (?i:...)
  // In PCRE, (?i:...) makes that group case-insensitive
  // In JavaScript, we expand letters to character classes [aA][bB][cC]
  jsRegex = convertCaseInsensitiveGroups(jsRegex);

  // Handle PCRE named capture groups (?P<name>...) - convert to regular capture groups
  // JavaScript doesn't support the ?P syntax, but does support (?<name>...)
  jsRegex = jsRegex.replace(/\(\?P<([^>]+)>/g, '(?<$1>');

  return {
    pattern: jsRegex,
    caseInsensitive,
  };
};

/**
 * Converts PCRE dotall mode groups (?s:...) to JavaScript equivalent.
 * Replaces . with [\s\S] inside these groups so dots match newlines.
 */
function convertDotallGroups(pattern: string): string {
  // Match (?s:...) groups, handling nested parentheses
  return pattern.replace(/\(\?s:([^)]+)\)/g, (_match, groupContent) => {
    // Replace unescaped dots with [\s\S] inside the group
    // We process character by character to handle escaped dots properly
    let converted = '';
    for (let i = 0; i < groupContent.length; i++) {
      if (groupContent[i] === '\\' && i + 1 < groupContent.length) {
        // Escaped character - keep both backslash and next character
        converted += groupContent[i] + groupContent[i + 1];
        i++; // Skip next character
      } else if (groupContent[i] === '.') {
        // Unescaped dot - replace with [\s\S]
        converted += '[\\s\\S]';
      } else {
        // Regular character
        converted += groupContent[i];
      }
    }
    return `(?:${converted})`;
  });
}

/**
 * Converts PCRE case-insensitive groups (?i:...) to JavaScript equivalent.
 * Expands letters to character classes like [aA][bB][cC] to achieve case-insensitivity.
 */
function convertCaseInsensitiveGroups(pattern: string): string {
  // Match (?i:...) groups - we need to handle potentially nested groups
  return pattern.replace(/\(\?i:([^)]+)\)/g, (_match, groupContent) => {
    const converted = expandToCaseInsensitive(groupContent);
    return `(?:${converted})`;
  });
}

/**
 * Expands literal letters in a regex pattern to case-insensitive character classes.
 * Handles escaped characters, existing character classes, and other regex constructs.
 */
function expandToCaseInsensitive(text: string): string {
  let result = '';
  let i = 0;

  while (i < text.length) {
    const char = text[i];
    if (char === undefined) {
      break;
    }

    const nextChar = text[i + 1];

    // Handle escaped characters
    if (char === '\\' && i + 1 < text.length && nextChar !== undefined) {
      result += char + nextChar;
      i += 2;
      continue; // eslint-disable-line no-continue
    }

    // Handle existing character classes [...]
    if (char === '[') {
      const closeIndex = findMatchingBracket(text, i);
      if (closeIndex !== -1) {
        result += text.substring(i, closeIndex + 1);
        i = closeIndex + 1;
        continue; // eslint-disable-line no-continue
      }
    }

    // Handle letters - expand to character class
    if (/[a-zA-Z]/.test(char)) {
      const lower = char.toLowerCase();
      const upper = char.toUpperCase();
      if (lower !== upper) {
        result += `[${lower}${upper}]`;
      } else {
        result += char;
      }
      i++;
      continue; // eslint-disable-line no-continue
    }

    // Regular character
    result += char;
    i++;
  }

  return result;
}

/**
 * Finds the closing bracket ] that matches the opening bracket at startIndex.
 * Handles escaped brackets and negated character classes.
 */
function findMatchingBracket(text: string, startIndex: number): number {
  let i = startIndex + 1;

  // Handle negated character class [^...]
  if (i < text.length && text[i] === '^') {
    i++;
  }

  // Handle ] as first character in class (literal ]) - e.g., []abc] or [^]abc]
  if (i < text.length && text[i] === ']') {
    i++;
  }

  while (i < text.length) {
    if (text[i] === '\\' && i + 1 < text.length) {
      // Escaped character - skip both
      i += 2;
      continue; // eslint-disable-line no-continue
    }
    if (text[i] === ']') {
      return i;
    }
    i++;
  }

  return -1; // No matching bracket found
}
