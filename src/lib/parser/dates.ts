import { setHours, startOfDay, subDays } from 'date-fns';

/**
 * Relative and short dates in English and Taglish. Each rule returns the day
 * and the matched text (removed from the phrase before other parsing).
 * Past days are set to noon so a time-zone shift can't move them a day.
 */

const WEEKDAYS: Record<string, number> = {
  sunday: 0, sun: 0, linggo: 0,
  monday: 1, mon: 1, lunes: 1,
  tuesday: 2, tue: 2, tues: 2, martes: 2,
  wednesday: 3, wed: 3, miyerkules: 3, miyerkoles: 3,
  thursday: 4, thu: 4, thur: 4, thurs: 4, huwebes: 4,
  friday: 5, fri: 5, biyernes: 5,
  saturday: 6, sat: 6, sabado: 6,
};

const MONTHS: Record<string, number> = {
  jan: 0, january: 0, enero: 0,
  feb: 1, february: 1, pebrero: 1,
  mar: 2, march: 2, marso: 2,
  apr: 3, april: 3, abril: 3,
  may: 4, mayo: 4,
  jun: 5, june: 5, hunyo: 5,
  jul: 6, july: 6, hulyo: 6,
  aug: 7, august: 7, agosto: 7,
  sep: 8, sept: 8, september: 8, setyembre: 8,
  oct: 9, october: 9, oktubre: 9,
  nov: 10, november: 10, nobyembre: 10,
  dec: 11, december: 11, disyembre: 11,
};

export interface DateMatch {
  date: Date;
  /** The exact text that was recognised. */
  text: string;
}

const noonDaysAgo = (now: Date, days: number) => setHours(startOfDay(subDays(now, days)), 12);

const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';
const weekdayNames = Object.keys(WEEKDAYS).sort((a, b) => b.length - a.length).join('|');
const monthNames = Object.keys(MONTHS).sort((a, b) => b.length - a.length).join('|');

const RULES: { re: RegExp; date: (m: RegExpExecArray, now: Date) => Date | null }[] = [
  { re: new RegExp(`${B}(day before yesterday|kamakalawa)${E}`, 'iu'), date: (_m, now) => noonDaysAgo(now, 2) },
  { re: new RegExp(`${B}(yesterday|kahapon|yday)${E}`, 'iu'), date: (_m, now) => noonDaysAgo(now, 1) },
  { re: new RegExp(`${B}(today|ngayon|kanina|tonight|this morning)${E}`, 'iu'), date: (_m, now) => now },
  { re: new RegExp(`${B}(last week|nakaraang linggo|noong isang linggo)${E}`, 'iu'), date: (_m, now) => noonDaysAgo(now, 7) },
  {
    re: new RegExp(`${B}(\\d{1,3})\\s*(days?|araw)\\s*(ago|na ang nakalipas|nakaraan)${E}`, 'iu'),
    date: (m, now) => noonDaysAgo(now, Number(m[1])),
  },
  {
    re: new RegExp(`${B}(last|noong)\\s+(${weekdayNames})${E}`, 'iu'),
    date: (m, now) => {
      const target = WEEKDAYS[m[2]!.toLowerCase()]!;
      const back = (now.getDay() - target + 7) % 7 || 7;
      return noonDaysAgo(now, back);
    },
  },
  {
    re: new RegExp(`${B}(${weekdayNames})${E}`, 'iu'),
    date: (m, now) => {
      const target = WEEKDAYS[m[1]!.toLowerCase()]!;
      const back = (now.getDay() - target + 7) % 7;
      return back === 0 ? now : noonDaysAgo(now, back);
    },
  },
  {
    re: new RegExp(`${B}(${monthNames})\\.?\\s+(\\d{1,2})(?:,?\\s+(\\d{4}))?${E}`, 'iu'),
    date: (m, now) => calendarDay(now, MONTHS[m[1]!.toLowerCase()]!, Number(m[2]), m[3] ? Number(m[3]) : null),
  },
  {
    re: new RegExp(`${B}(\\d{1,2})\\s+(${monthNames})\\.?(?:\\s+(\\d{4}))?${E}`, 'iu'),
    date: (m, now) => calendarDay(now, MONTHS[m[2]!.toLowerCase()]!, Number(m[1]), m[3] ? Number(m[3]) : null),
  },
  {
    // Month/day as written in the Philippines (10/5 = October 5).
    re: new RegExp(`${B}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2}|\\d{4}))?${E}`, 'u'),
    date: (m, now) => {
      const year = m[3] ? Number(m[3].length === 2 ? `20${m[3]}` : m[3]) : null;
      return calendarDay(now, Number(m[1]) - 1, Number(m[2]), year);
    },
  },
];

/** A day this year (or last year if that would be in the future), unless a year is given. */
function calendarDay(now: Date, month: number, day: number, year: number | null): Date | null {
  if (month < 0 || month > 11 || day < 1 || day > 31) return null;
  let date = new Date(year ?? now.getFullYear(), month, day, 12, 0, 0, 0);
  if (date.getMonth() !== month) return null; // e.g. Feb 31
  if (year === null && date.getTime() > now.getTime()) date = new Date(now.getFullYear() - 1, month, day, 12, 0, 0, 0);
  return date;
}

/** The first date expression in `text`, if any. */
export function findDate(text: string, now: Date): DateMatch | null {
  let best: { index: number; match: DateMatch } | null = null;
  for (const rule of RULES) {
    const m = rule.re.exec(text);
    if (!m) continue;
    const date = rule.date(m, now);
    if (!date) continue;
    // Earlier rules are more specific; only a match that starts earlier replaces them.
    if (!best || m.index < best.index) best = { index: m.index, match: { date, text: m[0] } };
  }
  return best?.match ?? null;
}
