import { addDays, addMonths, dayKey, MONTH_NAMES, sundayStart, type DayKey } from './calendar';

// Repeating calendar events (owner request, 2026-11-22): Google Calendar-style presets, Custom…
// intervals/weekdays/ends, RFC 5545 RRULE serialization & parsing, and pure occurrence expansion
// (used by the local dev server). Unreadable/unsupported rules stay read-only and untouched.

export type RepeatUnit = 'day' | 'week' | 'month' | 'year';
export type WeekdayCode = 'SU' | 'MO' | 'TU' | 'WE' | 'TH' | 'FR' | 'SA';

export type RepeatEnd =
  | { kind: 'never' }
  | { kind: 'on'; date: DayKey }
  | { kind: 'after'; count: number };

export interface CustomRepeat {
  /** Whole number 1..99. */
  interval: number;
  unit: RepeatUnit;
  /** Only for unit === 'week': non-empty list ordered Sunday..Saturday. */
  days?: WeekdayCode[];
  /** Only for unit === 'month': same day of month ('day') or nth/last weekday ('weekday'). */
  monthlyBy?: 'day' | 'weekday';
  end: RepeatEnd;
}

export type Repeat =
  | { kind: 'none' }
  | { kind: 'daily' }
  | { kind: 'weekly' }
  | { kind: 'monthly-weekday' }
  | { kind: 'yearly' }
  | { kind: 'weekday' }
  | { kind: 'custom'; rule: CustomRepeat }
  | { kind: 'unsupported'; raw: string[] };

export type PresetKind = 'none' | 'daily' | 'weekly' | 'monthly-weekday' | 'yearly' | 'weekday' | 'custom';

export const WEEKDAY_CODES: readonly WeekdayCode[] = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
export const WEEKDAY_NAMES: readonly string[] = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAY_SHORT: readonly string[] = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const WEEKDAY_INITIALS: readonly string[] = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

const ORDINALS = ['', 'first', 'second', 'third', 'fourth'];
const FREQ_BY_UNIT: Record<RepeatUnit, string> = { day: 'DAILY', week: 'WEEKLY', month: 'MONTHLY', year: 'YEARLY' };
const UNIT_BY_FREQ: Record<string, RepeatUnit> = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' };
const ALLOWED_KEYS = new Set(['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'COUNT', 'UNTIL', 'WKST']);
const FALLBACK_DAY: DayKey = '2026-01-01';

const pad = (n: number) => String(n).padStart(2, '0');

function isValidDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function safeDay(key: DayKey): DayKey {
  return isValidDay(key) ? key : FALLBACK_DAY;
}

function dateParts(key: DayKey) {
  const [y, m, d] = safeDay(key).split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12));
  return { y, m, d, dow: dt.getUTCDay() };
}

/** Weekday code ('SU'..'SA') of a day key. */
export function weekdayCodeOf(key: DayKey): WeekdayCode {
  return WEEKDAY_CODES[dateParts(key).dow];
}

/** 1..4 for days 1..28, -1 ('last') for days 29..31 so a monthly weekday rule fires every month. */
function monthlyWeekdayPos(dayOfMonth: number): 1 | 2 | 3 | 4 | -1 {
  const nth = Math.floor((dayOfMonth - 1) / 7) + 1;
  return nth >= 5 ? -1 : (nth as 1 | 2 | 3 | 4);
}

/** "Monthly on day 15" / "Monthly on the third Sunday" labels for the custom monthly picker. */
export function monthlyLabels(startDate: DayKey): { day: string; weekday: string } {
  const { d, dow } = dateParts(startDate);
  const pos = monthlyWeekdayPos(d);
  const ord = pos === -1 ? 'last' : ORDINALS[pos];
  return {
    day: `Monthly on day ${d}`,
    weekday: `Monthly on the ${ord} ${WEEKDAY_NAMES[dow]}`,
  };
}

/** Labels for every option in the Repeat dropdown, matching Google Calendar's phrasing. */
export function presetLabels(startDate: DayKey): Record<PresetKind, string> {
  const { m, d, dow } = dateParts(startDate);
  const { weekday } = monthlyLabels(startDate);
  return {
    none: 'Does not repeat',
    daily: 'Daily',
    weekly: `Weekly on ${WEEKDAY_NAMES[dow]}`,
    'monthly-weekday': weekday,
    yearly: `Annually on ${MONTH_NAMES[m - 1]} ${d}`,
    weekday: 'Every weekday',
    custom: 'Custom…',
  };
}

function sortDays(days: WeekdayCode[]): WeekdayCode[] {
  const set = new Set(days);
  return WEEKDAY_CODES.filter((c) => set.has(c));
}

function formatUntil(date: DayKey, allDay: boolean): string {
  const [y, m, d] = date.split('-').map(Number);
  if (allDay) return `${y}${pad(m)}${pad(d)}`;
  // RFC 5545 requires UTC date-time for timed events: local end-of-day converted to UTC round-trips in any zone.
  const utc = new Date(y, m - 1, d, 23, 59, 59);
  return `${utc.getUTCFullYear()}${pad(utc.getUTCMonth() + 1)}${pad(utc.getUTCDate())}T${pad(utc.getUTCHours())}${pad(utc.getUTCMinutes())}${pad(utc.getUTCSeconds())}Z`;
}

function parseUntil(raw: string): DayKey | null {
  if (/^\d{8}$/.test(raw)) {
    const key = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    return isValidDay(key) ? key : null;
  }
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/i.exec(raw);
  if (!m) return null;
  const dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]));
  if (Number.isNaN(dt.getTime())) return null;
  return dayKey(dt);
}

/** Plain-English validation error for a repeat setting, or null when it is valid. */
export function validateRepeat(repeat: Repeat, startDate: DayKey): string | null {
  if (repeat.kind !== 'custom') return null;
  const { interval, unit, days, end } = repeat.rule;
  if (!Number.isInteger(interval) || interval < 1 || interval > 99) return 'Repeat interval must be between 1 and 99.';
  if (unit === 'week' && (!days || days.length === 0)) return 'Pick at least one day to repeat on.';
  if (end.kind === 'on') {
    if (!isValidDay(end.date)) return 'Pick a valid repeat end date.';
    if (isValidDay(startDate) && end.date < startDate) return 'The repeat end date must be on or after the start date.';
  }
  if (end.kind === 'after') {
    if (!Number.isInteger(end.count) || end.count < 1 || end.count > 999) return 'Repeat occurrences must be between 1 and 999.';
  }
  return null;
}

/**
 * Google Calendar `recurrence` array for a Repeat setting:
 * - `[]` for `none` (clears recurrence when patching an existing series; omitted on new events)
 * - `['RRULE:...']` for a supported rule
 * - `null` for `unsupported` (never overwritten) or invalid custom inputs.
 */
export function toRecurrence(repeat: Repeat, startDate: DayKey, allDay: boolean): string[] | null {
  if (repeat.kind === 'unsupported') return null;
  if (repeat.kind === 'none') return [];
  if (validateRepeat(repeat, startDate)) return null;
  const { d, dow } = dateParts(startDate);
  const wd = WEEKDAY_CODES[dow];
  if (repeat.kind === 'daily') return ['RRULE:FREQ=DAILY'];
  if (repeat.kind === 'weekly') return [`RRULE:FREQ=WEEKLY;BYDAY=${wd}`];
  if (repeat.kind === 'monthly-weekday') return [`RRULE:FREQ=MONTHLY;BYDAY=${monthlyWeekdayPos(d)}${wd}`];
  if (repeat.kind === 'yearly') return ['RRULE:FREQ=YEARLY'];
  if (repeat.kind === 'weekday') return ['RRULE:FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR'];

  const { interval, unit, days, monthlyBy, end } = repeat.rule;
  const parts = [`FREQ=${FREQ_BY_UNIT[unit]}`];
  if (interval > 1) parts.push(`INTERVAL=${interval}`);
  if (unit === 'week') {
    const picked = sortDays(days && days.length ? days : [wd]);
    parts.push(`BYDAY=${picked.join(',')}`);
  } else if (unit === 'month' && monthlyBy === 'weekday') {
    parts.push(`BYDAY=${monthlyWeekdayPos(d)}${wd}`);
  }
  if (end.kind === 'after') parts.push(`COUNT=${end.count}`);
  else if (end.kind === 'on') parts.push(`UNTIL=${formatUntil(end.date, allDay)}`);
  return [`RRULE:${parts.join(';')}`];
}

/** Parses Google's `recurrence` array into our Repeat model, or `unsupported` if anything can't round-trip losslessly. */
export function parseRecurrence(recurrence: string[] | undefined, startDate: DayKey): Repeat {
  if (!recurrence || recurrence.length === 0) return { kind: 'none' };
  const unsup = (): Repeat => ({ kind: 'unsupported', raw: recurrence });
  if (recurrence.length !== 1) return unsup();
  const line = recurrence[0].trim();
  if (!/^RRULE:/i.test(line)) return unsup();
  const body = line.slice(6);
  if (!body) return unsup();

  const map = new Map<string, string>();
  for (const part of body.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) return unsup();
    const k = part.slice(0, eq).toUpperCase();
    const v = part.slice(eq + 1).toUpperCase();
    if (!ALLOWED_KEYS.has(k) || map.has(k) || !v) return unsup();
    map.set(k, v);
  }

  const freq = map.get('FREQ');
  const unit = freq ? UNIT_BY_FREQ[freq] : undefined;
  if (!unit) return unsup();

  let interval = 1;
  if (map.has('INTERVAL')) {
    const raw = map.get('INTERVAL')!;
    if (!/^\d+$/.test(raw)) return unsup();
    interval = Number(raw);
    if (interval < 1 || interval > 99) return unsup();
  }

  // WKST only affects multi-week intervals; accept WKST=SU always, and any WKST when it has no effect.
  if (map.has('WKST')) {
    const wkst = map.get('WKST')!;
    if (!WEEKDAY_CODES.includes(wkst as WeekdayCode)) return unsup();
    if (unit === 'week' && interval > 1 && wkst !== 'SU') return unsup();
  }

  if (map.has('COUNT') && map.has('UNTIL')) return unsup();
  let end: RepeatEnd = { kind: 'never' };
  if (map.has('COUNT')) {
    const raw = map.get('COUNT')!;
    if (!/^\d+$/.test(raw)) return unsup();
    const count = Number(raw);
    if (count < 1 || count > 999) return unsup();
    end = { kind: 'after', count };
  } else if (map.has('UNTIL')) {
    const date = parseUntil(map.get('UNTIL')!);
    if (!date) return unsup();
    end = { kind: 'on', date };
  }

  const { d, dow } = dateParts(startDate);
  const startWd = WEEKDAY_CODES[dow];
  const byDay = map.get('BYDAY');
  const byMonthDay = map.get('BYMONTHDAY');

  if (unit === 'day') {
    if (byDay || byMonthDay) return unsup();
    if (interval === 1 && end.kind === 'never') return { kind: 'daily' };
    return { kind: 'custom', rule: { interval, unit: 'day', end } };
  }

  if (unit === 'week') {
    if (byMonthDay) return unsup();
    let days: WeekdayCode[];
    if (byDay) {
      const items = byDay.split(',');
      if (!items.every((x) => WEEKDAY_CODES.includes(x as WeekdayCode))) return unsup();
      days = sortDays(items as WeekdayCode[]);
    } else {
      days = [startWd];
    }
    if (interval === 1 && end.kind === 'never') {
      if (days.length === 1 && days[0] === startWd) return { kind: 'weekly' };
      if (days.join(',') === 'MO,TU,WE,TH,FR') return { kind: 'weekday' };
    }
    return { kind: 'custom', rule: { interval, unit: 'week', days, end } };
  }

  if (unit === 'month') {
    if (byDay && byMonthDay) return unsup();
    if (byDay) {
      const m = /^([1-4]|-1)(SU|MO|TU|WE|TH|FR|SA)$/.exec(byDay);
      if (!m) return unsup();
      const pos = Number(m[1]);
      const wd = m[2] as WeekdayCode;
      // Only accept when it matches startDate's exact monthlyWeekdayPos, so saving never alters the rule.
      if (wd !== startWd || pos !== monthlyWeekdayPos(d)) return unsup();
      if (interval === 1 && end.kind === 'never') return { kind: 'monthly-weekday' };
      return { kind: 'custom', rule: { interval, unit: 'month', monthlyBy: 'weekday', end } };
    }
    if (byMonthDay) {
      if (!/^\d+$/.test(byMonthDay) || Number(byMonthDay) !== d) return unsup();
    }
    return { kind: 'custom', rule: { interval, unit: 'month', monthlyBy: 'day', end } };
  }

  // unit === 'year'
  if (byDay || byMonthDay) return unsup();
  if (interval === 1 && end.kind === 'never') return { kind: 'yearly' };
  return { kind: 'custom', rule: { interval, unit: 'year', end } };
}

/** Whether two Repeat values produce the exact same recurrence. */
export function sameRepeat(a: Repeat, b: Repeat, startDate: DayKey, allDay: boolean): boolean {
  if (a.kind === 'unsupported' || b.kind === 'unsupported') {
    return a.kind === 'unsupported' && b.kind === 'unsupported' && a.raw.length === b.raw.length && a.raw.every((x, i) => x === b.raw[i]);
  }
  const ra = toRecurrence(a, startDate, allDay);
  const rb = toRecurrence(b, startDate, allDay);
  if (ra === null || rb === null) return false;
  return ra.length === rb.length && ra.every((x, i) => x === rb[i]);
}

/** Initial CustomRepeat values when switching the dropdown to Custom…. */
export function customFrom(repeat: Repeat, startDate: DayKey): CustomRepeat {
  const wd = weekdayCodeOf(startDate);
  if (repeat.kind === 'custom') return { ...repeat.rule, days: repeat.rule.days ? [...repeat.rule.days] : undefined, end: { ...repeat.rule.end } };
  if (repeat.kind === 'daily') return { interval: 1, unit: 'day', end: { kind: 'never' } };
  if (repeat.kind === 'weekly') return { interval: 1, unit: 'week', days: [wd], end: { kind: 'never' } };
  if (repeat.kind === 'weekday') return { interval: 1, unit: 'week', days: ['MO', 'TU', 'WE', 'TH', 'FR'], end: { kind: 'never' } };
  if (repeat.kind === 'monthly-weekday') return { interval: 1, unit: 'month', monthlyBy: 'weekday', end: { kind: 'never' } };
  if (repeat.kind === 'yearly') return { interval: 1, unit: 'year', end: { kind: 'never' } };
  return { interval: 1, unit: 'week', days: [wd], end: { kind: 'never' } };
}

/** Default "Ends on" date when the person selects "On" (one month after startDate). */
export function defaultEndDate(startDate: DayKey): DayKey {
  return addMonths(safeDay(startDate), 1);
}

/** Plain-English description of a Repeat setting. */
export function repeatSummary(repeat: Repeat, startDate: DayKey): string {
  if (repeat.kind === 'unsupported') return 'Custom repeat (edit in Google Calendar)';
  const labels = presetLabels(startDate);
  if (repeat.kind !== 'custom') return labels[repeat.kind];
  const { interval, unit, days, monthlyBy, end } = repeat.rule;
  const units: Record<RepeatUnit, [string, string]> = { day: ['day', 'days'], week: ['week', 'weeks'], month: ['month', 'months'], year: ['year', 'years'] };
  let base = interval === 1 ? `Every ${units[unit][0]}` : `Every ${interval} ${units[unit][1]}`;
  if (unit === 'week' && days?.length) {
    const names = sortDays(days).map((c) => WEEKDAY_SHORT[WEEKDAY_CODES.indexOf(c)]);
    base += ` on ${names.join(', ')}`;
  } else if (unit === 'month') {
    const m = monthlyLabels(startDate);
    base = interval === 1 ? (monthlyBy === 'weekday' ? m.weekday : m.day) : `${base} (${monthlyBy === 'weekday' ? m.weekday.replace(/^Monthly /, '') : m.day.replace(/^Monthly /, '')})`;
  }
  if (end.kind === 'after') base += `, ${end.count} ${end.count === 1 ? 'time' : 'times'}`;
  else if (end.kind === 'on') base += `, until ${end.date}`;
  return base;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
}

function nthWeekdayInMonth(y: number, m: number, dow: number, pos: number): DayKey | null {
  const total = daysInMonth(y, m);
  if (pos === -1) {
    for (let d = total; d >= 1; d--) {
      if (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() === dow) return `${y}-${pad(m)}-${pad(d)}`;
    }
    return null;
  }
  let hits = 0;
  for (let d = 1; d <= total; d++) {
    if (new Date(Date.UTC(y, m - 1, d, 12)).getUTCDay() === dow) {
      if (++hits === pos) return `${y}-${pad(m)}-${pad(d)}`;
    }
  }
  return null;
}

const MAX_STEPS = 5000;
const MAX_OUT = 500;

/**
 * Expands a Google `recurrence` array starting on `startDate` into occurrence day keys in `[from, to)`.
 * Used by the local dev server so creating or editing repeating events populates real occurrences.
 */
export function expandRecurrence(startDate: DayKey, recurrence: string[], from: DayKey, to: DayKey): DayKey[] {
  if (!isValidDay(startDate) || !isValidDay(from) || !isValidDay(to) || from >= to) return [];
  const rrule = recurrence.find((r) => /^RRULE:/i.test(r.trim()));
  if (!rrule) return [];
  const map = new Map<string, string>();
  for (const part of rrule.trim().slice(6).split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0) map.set(part.slice(0, eq).toUpperCase(), part.slice(eq + 1).toUpperCase());
  }
  const freq = map.get('FREQ');
  const interval = Math.max(1, Number(map.get('INTERVAL') ?? 1) || 1);
  const count = map.has('COUNT') ? Math.max(1, Number(map.get('COUNT')) || 1) : null;
  const until = map.has('UNTIL') ? parseUntil(map.get('UNTIL')!) : null;
  const { y: sy, m: sm, d: sd, dow: sDow } = dateParts(startDate);

  const out: DayKey[] = [];
  let seen = 0;
  const take = (day: DayKey): boolean => {
    if (day < startDate) return true;
    if (until && day > until) return false;
    seen++;
    if (count !== null && seen > count) return false;
    if (day >= to) return false;
    if (day >= from) out.push(day);
    return out.length < MAX_OUT;
  };

  if (freq === 'DAILY') {
    for (let i = 0; i < MAX_STEPS; i++) {
      if (!take(addDays(startDate, i * interval))) break;
    }
    return out;
  }

  if (freq === 'WEEKLY') {
    const byDay = map.get('BYDAY');
    const dows = byDay
      ? byDay
          .split(',')
          .map((c) => WEEKDAY_CODES.indexOf(c as WeekdayCode))
          .filter((i) => i >= 0)
          .sort((a, b) => a - b)
      : [sDow];
    if (!dows.length) return [];
    const baseSun = sundayStart(startDate);
    for (let w = 0; w < MAX_STEPS; w++) {
      const weekSun = addDays(baseSun, w * 7 * interval);
      if (weekSun >= to || (until && weekSun > until)) break;
      for (const dow of dows) {
        if (!take(addDays(weekSun, dow))) return out;
      }
    }
    return out;
  }

  if (freq === 'MONTHLY') {
    const byDay = map.get('BYDAY');
    const mRule = byDay ? /^([1-4]|-1)(SU|MO|TU|WE|TH|FR|SA)$/.exec(byDay) : null;
    const targetDay = map.has('BYMONTHDAY') ? Number(map.get('BYMONTHDAY')) : sd;
    for (let i = 0; i < MAX_STEPS; i++) {
      const totalMonths = sy * 12 + (sm - 1) + i * interval;
      const y = Math.floor(totalMonths / 12);
      const m = (totalMonths % 12) + 1;
      const day = mRule
        ? nthWeekdayInMonth(y, m, WEEKDAY_CODES.indexOf(mRule[2] as WeekdayCode), Number(mRule[1]))
        : targetDay >= 1 && targetDay <= daysInMonth(y, m)
          ? `${y}-${pad(m)}-${pad(targetDay)}`
          : null;
      if (!day) {
        if (`${y}-${pad(m)}-01` >= to || (until && `${y}-${pad(m)}-01` > until)) break;
        continue;
      }
      if (!take(day)) break;
    }
    return out;
  }

  if (freq === 'YEARLY') {
    for (let i = 0; i < MAX_STEPS; i++) {
      const y = sy + i * interval;
      if (sd > daysInMonth(y, sm)) {
        if (`${y}-${pad(sm)}-01` >= to || (until && `${y}-${pad(sm)}-01` > until)) break;
        continue;
      }
      if (!take(`${y}-${pad(sm)}-${pad(sd)}`)) break;
    }
    return out;
  }

  return out;
}
