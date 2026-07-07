/**
 * Redacts the password component of a URL, preserving the rest of the URL structure.
 * If the URL cannot be parsed, returns asterisks matching the input length to avoid
 * accidentally leaking credentials.
 *
 * @example
 * redactUrlCredential('http://user:secret@example.com:8080') // 'http://user:******@example.com:8080/'
 * redactUrlCredential('http://example.com:8080')             // 'http://example.com:8080/'
 * redactUrlCredential('not-a-url')                           // '*********'
 */
export function redactUrlCredential(url: string): string {
  try {
    const parsed = new URL(url);
    if (parsed.password) {
      parsed.password = '*'.repeat(parsed.password.length);
    }
    return parsed.toString();
  } catch {
    return '*'.repeat(url.length);
  }
}
