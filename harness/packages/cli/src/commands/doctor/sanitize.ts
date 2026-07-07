import { redactUrlCredential, SecretRedactor } from '@gitlab-org/secret-redaction';

const HOME_PATH_PATTERNS: readonly { regex: RegExp; replacement: string }[] = [
  // /Users/<name>/...      (macOS)
  { regex: /(\/Users\/)[^/\s]+/g, replacement: '$1[user]' },
  // /home/<name>/...       (Linux)
  { regex: /(\/home\/)[^/\s]+/g, replacement: '$1[user]' },
  // C:\Users\<name>\...    (Windows)
  { regex: /([A-Za-z]:\\Users\\)[^\\\s]+/g, replacement: '$1[user]' },
];

const URL_WITH_CREDENTIALS_REGEX = /https?:\/\/[^/\s@]+:[^/\s@]+@[^\s]+/g;

function redactHomePaths(text: string): string {
  return HOME_PATH_PATTERNS.reduce(
    (acc, { regex, replacement }) => acc.replace(regex, replacement),
    text,
  );
}

function redactUrlCredentials(text: string): string {
  return text.replace(URL_WITH_CREDENTIALS_REGEX, (match) => redactUrlCredential(match));
}

/** Strip URL credentials, home-path usernames, and secrets from the report. */
export function sanitizeForReport(text: string, secretRedactor: SecretRedactor): string {
  const withoutUrlCreds = redactUrlCredentials(text);
  const withoutHomePaths = redactHomePaths(withoutUrlCreds);
  return secretRedactor.redactSecrets(withoutHomePaths, 'doctor-report');
}
