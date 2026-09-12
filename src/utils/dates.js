import { env } from '../config/env.js';

// All "day" / "week" boundaries are computed in the business timezone (default Asia/Dhaka, UTC+6).
const OFFSET_MS = env.TZ_OFFSET_MINUTES * 60_000;
export const DAY_MS = 86_400_000;

const shifted = (d) => new Date(new Date(d).getTime() + OFFSET_MS);

export const tzString = (() => {
  const sign = env.TZ_OFFSET_MINUTES >= 0 ? '+' : '-';
  const abs = Math.abs(env.TZ_OFFSET_MINUTES);
  return `${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
})();

/** 'YYYY-MM-DD' in business time. */
export const dayKey = (d = new Date()) => shifted(d).toISOString().slice(0, 10);

/** Start of the business day containing `d`, as a UTC Date. */
export function startOfDay(d = new Date()) {
  const s = shifted(d);
  s.setUTCHours(0, 0, 0, 0);
  return new Date(s.getTime() - OFFSET_MS);
}

/** Start of the business week (Monday) containing `d`. */
export function startOfWeek(d = new Date()) {
  const s = shifted(d);
  s.setUTCHours(0, 0, 0, 0);
  const daysSinceMonday = (s.getUTCDay() + 6) % 7;
  return new Date(s.getTime() - daysSinceMonday * DAY_MS - OFFSET_MS);
}

/** ISO week key, e.g. '2026-W37'. */
export function weekKey(d = new Date()) {
  const s = shifted(d);
  const date = new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth(), s.getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // Thursday of this week
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const week =
    1 +
    Math.round(((date - firstThursday) / DAY_MS - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

/** Period bucket a mission execution belongs to. */
export function periodKeyFor(recurrence, d = new Date()) {
  if (recurrence === 'Daily') return dayKey(d);
  if (recurrence === 'Weekly') return weekKey(d);
  return 'once';
}
