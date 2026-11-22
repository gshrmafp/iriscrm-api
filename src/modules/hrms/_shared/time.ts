import { env } from '../../../config/env';

// Today's calendar date in the HR timezone, as a UTC-midnight Date — the form
// Prisma expects for @db.Date columns. Using the server's local date instead
// would roll over at the wrong moment on a UTC server.
export function todayInHrTimezone(now: Date = new Date()): Date {
  const ymd = new Intl.DateTimeFormat('en-CA', {
    timeZone: env.HR_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now); // "YYYY-MM-DD"
  return new Date(`${ymd}T00:00:00.000Z`);
}
