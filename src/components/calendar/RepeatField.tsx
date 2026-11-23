import type { DayKey } from '../../model/calendar';
import {
  customFrom,
  defaultEndDate,
  monthlyLabels,
  presetLabels,
  WEEKDAY_CODES,
  WEEKDAY_INITIALS,
  WEEKDAY_NAMES,
  weekdayCodeOf,
  type CustomRepeat,
  type PresetKind,
  type Repeat,
  type RepeatUnit,
  type WeekdayCode,
} from '../../model/calendarRepeat';

const PRESET_ORDER: PresetKind[] = ['none', 'daily', 'weekly', 'monthly-weekday', 'yearly', 'weekday', 'custom'];

/** Repeat dropdown (Google Calendar presets + Custom…) for quick-add and full event forms (owner request, 2026-11-22). */
export function RepeatField({
  repeat,
  status,
  startDate,
  labelled,
  onChange,
}: {
  repeat: Repeat;
  status: 'loading' | 'ready' | 'error';
  startDate: DayKey;
  labelled: boolean;
  onChange: (next: Repeat) => void;
}) {
  if (status === 'loading') {
    return (
      <label className="cal-field">
        {labelled && <span>Repeat</span>}
        <select className="cal-select" aria-label="Repeat" disabled value="loading">
          <option value="loading">Loading repeat…</option>
        </select>
      </label>
    );
  }
  if (status === 'error') {
    return (
      <div className="cal-field">
        {labelled && <span>Repeat</span>}
        <p className="cal-repeat-readonly">Repeat couldn’t be loaded (left unchanged)</p>
      </div>
    );
  }
  if (repeat.kind === 'unsupported') {
    return (
      <div className="cal-field">
        {labelled && <span>Repeat</span>}
        <p className="cal-repeat-readonly">Custom repeat (edit in Google Calendar)</p>
      </div>
    );
  }

  const labels = presetLabels(startDate);
  const selectPreset = (kind: PresetKind) => {
    if (kind === 'custom') onChange({ kind: 'custom', rule: customFrom(repeat, startDate) });
    else onChange({ kind });
  };
  const updateCustom = (patch: Partial<CustomRepeat>) => {
    if (repeat.kind !== 'custom') return;
    onChange({ kind: 'custom', rule: { ...repeat.rule, ...patch } });
  };
  const changeUnit = (unit: RepeatUnit) => {
    if (repeat.kind !== 'custom') return;
    const base: CustomRepeat = { interval: repeat.rule.interval, unit, end: repeat.rule.end };
    if (unit === 'week') base.days = repeat.rule.days?.length ? repeat.rule.days : [weekdayCodeOf(startDate)];
    if (unit === 'month') base.monthlyBy = repeat.rule.monthlyBy ?? 'day';
    onChange({ kind: 'custom', rule: base });
  };
  const toggleDay = (code: WeekdayCode) => {
    if (repeat.kind !== 'custom') return;
    const current = repeat.rule.days ?? [];
    const has = current.includes(code);
    if (has && current.length <= 1) return;
    const nextDays = has ? current.filter((d) => d !== code) : [...current, code];
    updateCustom({ days: WEEKDAY_CODES.filter((c) => nextDays.includes(c)) });
  };

  const monthly = monthlyLabels(startDate);
  const plural = repeat.kind === 'custom' && repeat.rule.interval !== 1;

  return (
    <div className="cal-field">
      {labelled && <span>Repeat</span>}
      <select className="cal-select" aria-label="Repeat" value={repeat.kind} onChange={(e) => selectPreset(e.currentTarget.value as PresetKind)}>
        {PRESET_ORDER.map((k) => (
          <option key={k} value={k}>
            {labels[k]}
          </option>
        ))}
      </select>
      {repeat.kind === 'custom' && (
        <div className="cal-repeat-custom">
          <div className="cal-repeat-row">
            <span className="cal-repeat-label">Every</span>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={99}
              className="cal-repeat-num"
              aria-label="Repeat interval"
              value={repeat.rule.interval > 0 ? repeat.rule.interval : ''}
              onChange={(e) => updateCustom({ interval: e.currentTarget.value === '' ? 0 : Math.trunc(Number(e.currentTarget.value)) })}
            />
            <select className="cal-select cal-repeat-unit" aria-label="Repeat unit" value={repeat.rule.unit} onChange={(e) => changeUnit(e.currentTarget.value as RepeatUnit)}>
              <option value="day">{plural ? 'days' : 'day'}</option>
              <option value="week">{plural ? 'weeks' : 'week'}</option>
              <option value="month">{plural ? 'months' : 'month'}</option>
              <option value="year">{plural ? 'years' : 'year'}</option>
            </select>
          </div>
          {repeat.rule.unit === 'week' && (
            <div className="cal-repeat-days" role="group" aria-label="Repeat on">
              {WEEKDAY_CODES.map((code, i) => {
                const on = repeat.rule.days?.includes(code) ?? false;
                return (
                  <button key={code} type="button" className={`cal-repeat-day${on ? ' on' : ''}`} aria-label={WEEKDAY_NAMES[i]} aria-pressed={on} onClick={() => toggleDay(code)}>
                    {WEEKDAY_INITIALS[i]}
                  </button>
                );
              })}
            </div>
          )}
          {repeat.rule.unit === 'month' && (
            <select
              className="cal-select"
              aria-label="Monthly on"
              value={repeat.rule.monthlyBy ?? 'day'}
              onChange={(e) => updateCustom({ monthlyBy: e.currentTarget.value as 'day' | 'weekday' })}
            >
              <option value="day">{monthly.day}</option>
              <option value="weekday">{monthly.weekday}</option>
            </select>
          )}
          <div className="cal-repeat-ends" role="radiogroup" aria-label="Ends">
            <span className="cal-repeat-label">Ends</span>
            <div className="cal-repeat-end">
              <label className="cal-repeat-radio">
                <input type="radio" name="cal-repeat-end" checked={repeat.rule.end.kind === 'never'} onChange={() => updateCustom({ end: { kind: 'never' } })} />
                <span>Never</span>
              </label>
            </div>
            <div className="cal-repeat-end">
              <label className="cal-repeat-radio">
                <input
                  type="radio"
                  name="cal-repeat-end"
                  checked={repeat.rule.end.kind === 'on'}
                  onChange={() => updateCustom({ end: { kind: 'on', date: repeat.rule.end.kind === 'on' ? repeat.rule.end.date : defaultEndDate(startDate) } })}
                />
                <span>On</span>
              </label>
              <input
                type="date"
                aria-label="Repeat end date"
                value={repeat.rule.end.kind === 'on' ? repeat.rule.end.date : defaultEndDate(startDate)}
                onFocus={() => {
                  if (repeat.rule.end.kind !== 'on') updateCustom({ end: { kind: 'on', date: defaultEndDate(startDate) } });
                }}
                onChange={(e) => updateCustom({ end: { kind: 'on', date: e.currentTarget.value } })}
              />
            </div>
            <div className="cal-repeat-end">
              <label className="cal-repeat-radio">
                <input
                  type="radio"
                  name="cal-repeat-end"
                  checked={repeat.rule.end.kind === 'after'}
                  onChange={() => updateCustom({ end: { kind: 'after', count: repeat.rule.end.kind === 'after' ? repeat.rule.end.count : 10 } })}
                />
                <span>After</span>
              </label>
              <input
                type="number"
                inputMode="numeric"
                min={1}
                max={999}
                className="cal-repeat-num"
                aria-label="Repeat occurrences"
                value={repeat.rule.end.kind === 'after' ? (repeat.rule.end.count > 0 ? repeat.rule.end.count : '') : 10}
                onFocus={() => {
                  if (repeat.rule.end.kind !== 'after') updateCustom({ end: { kind: 'after', count: 10 } });
                }}
                onChange={(e) => updateCustom({ end: { kind: 'after', count: e.currentTarget.value === '' ? 0 : Math.trunc(Number(e.currentTarget.value)) } })}
              />
              <span className="cal-repeat-suffix">{repeat.rule.end.kind === 'after' && repeat.rule.end.count === 1 ? 'time' : 'times'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
