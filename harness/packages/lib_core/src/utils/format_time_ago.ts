const formatter = new Intl.RelativeTimeFormat('en', {
  numeric: 'auto',
});

type Division = {
  amount: number;
  name: Intl.RelativeTimeFormatUnit;
  abbr: string;
};

const DIVISIONS: Division[] = [
  { amount: 60, name: 'second', abbr: 's' },
  { amount: 60, name: 'minute', abbr: 'm' },
  { amount: 24, name: 'hour', abbr: 'h' },
  { amount: 7, name: 'day', abbr: 'd' },
  { amount: 4.34524, name: 'week', abbr: 'w' },
  { amount: 12, name: 'month', abbr: 'mo' },
  { amount: Number.POSITIVE_INFINITY, name: 'year', abbr: 'y' },
];

/**
 * @param date ISO string to format
 * @param useAbbreviations Whether to use abbreviated time units
 * @returns Formatted date or original date if an error occurs.
 */
export function formatTimeAgo(date: string, useAbbreviations = false): string {
  const dateToFormat = new Date(date);
  if (Number.isNaN(dateToFormat.getTime())) {
    return date;
  }

  let duration = (dateToFormat.getTime() - Date.now()) / 1000;

  for (const division of DIVISIONS) {
    if (Math.abs(duration) < division.amount) {
      if (useAbbreviations) {
        // Custom formatting with abbreviations
        const value = Math.round(duration);
        const unit = division.abbr;
        const prefix = duration > 0 ? 'in ' : '';
        const suffix = duration < 0 ? ' ago' : '';

        return `${prefix}${Math.abs(value)}${unit}${suffix}`;
      }
      // Use the original Intl formatter
      const result = formatter.format(Math.round(duration), division.name);
      return result.replace(/last/, 'Last');
    }
    duration /= division.amount;
  }

  return date;
}
