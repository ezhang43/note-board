import { describe, expect, it } from 'vitest';
import { IMPORT_MAX_CARDS } from './importFile';
import { NOTE_NAME_MAX } from './journal';
import { draftCards, minutesLabel, parseBrainDump } from './brainDump';

const titles = (text: string) => parseBrainDump(text).map((d) => d.title);
const one = (text: string) => parseBrainDump(text)[0];

describe('parseBrainDump: lines and bullets', () => {
  it('makes one note draft per line, in order', () => {
    expect(parseBrainDump('Buy milk\nCall mom')).toEqual([
      { title: 'Buy milk', kind: 'note' },
      { title: 'Call mom', kind: 'note' },
    ]);
  });
  it('skips blank and whitespace-only lines, and reads Windows line endings', () => {
    expect(titles('a\r\n\r\n   \t \r\nb\n\n')).toEqual(['a', 'b']);
  });
  it('gives nothing for empty or whitespace-only input', () => {
    expect(parseBrainDump('')).toEqual([]);
    expect(parseBrainDump('  \n\t\n   ')).toEqual([]);
  });
  it('removes bullet markers', () => {
    expect(titles('- one\n* two\n• three\n+ four\n– five')).toEqual(['one', 'two', 'three', 'four', 'five']);
  });
  it('removes numbering such as "1." and "2)"', () => {
    expect(titles('1. one\n2) two\n10. ten')).toEqual(['one', 'two', 'ten']);
  });
  it('keeps text that only looks like a marker', () => {
    expect(titles('-5 degrees tonight\n3.5 stars is fine\n*bold*\n2024 plan')).toEqual(['-5 degrees tonight', '3.5 stars is fine', '*bold*', '2024 plan']);
  });
  it('removes only one marker', () => {
    expect(titles('- 1. nested thing')).toEqual(['1. nested thing']);
  });
  it('ignores indentation (sub-bullets become their own drafts)', () => {
    expect(titles('- a\n    - b\n\t- c')).toEqual(['a', 'b', 'c']);
  });
  it('collapses runs of spaces and tabs inside a line', () => {
    expect(titles('  call \t  the   bank  ')).toEqual(['call the bank']);
  });
  it('a checkbox makes a to-do draft, ticked or not', () => {
    expect(parseBrainDump('[ ] a\n- [ ] b\n- [x] c\n[X] d')).toEqual([
      { title: 'a', kind: 'todo' },
      { title: 'b', kind: 'todo' },
      { title: 'c', kind: 'todo' },
      { title: 'd', kind: 'todo' },
    ]);
  });
  it('a bullet or checkbox with no text is skipped', () => {
    expect(titles('-\n- \n[ ]\n- [ ]   \n1.\nreal')).toEqual(['real']);
  });
});

describe('parseBrainDump: time estimates', () => {
  it.each([
    ['Write report 30m', 30],
    ['Write report 30 min', 30],
    ['Write report 30 mins', 30],
    ['Write report 45 minutes', 45],
    ['Write report 1h', 60],
    ['Write report 2 hours', 120],
    ['Write report 1 hr', 60],
    ['Write report 1h30', 90],
    ['Write report 1h30m', 90],
    ['Write report 1h 30m', 90],
    ['Write report 1h 15 min', 75],
    ['Write report 90 min', 90],
    ['Write report 1.5h', 90],
    ['Write report 0.5 hours', 30],
    ['Write report (45m)', 45],
    ['Write report [20m]', 20],
    ['(45m) Write report', 45],
    ['Write report 1H', 60],
    ['Write report 30M', 30],
  ])('reads the estimate in "%s"', (line, minutes) => {
    const d = one(line);
    expect(d.minutes).toBe(minutes);
    expect(d.title).toBe('Write report');
  });

  it('leaves minutes out when there is no estimate', () => {
    expect('minutes' in one('Write report')).toBe(false);
  });
  it('removes the token from the middle of a line and tidies the gap', () => {
    expect(one('Call 15m the bank')).toEqual({ title: 'Call the bank', minutes: 15, kind: 'note' });
  });
  it('drops a dash or colon left hanging before or after the token', () => {
    expect(one('Write report - 30m').title).toBe('Write report');
    expect(one('Write report: 30m').title).toBe('Write report');
    expect(one('30m - write report').title).toBe('write report');
    expect(one('30m: write report').title).toBe('write report');
  });
  it('works with bullets and checkboxes', () => {
    expect(one('- [ ] Plan trip 2h')).toEqual({ title: 'Plan trip', minutes: 120, kind: 'todo' });
    expect(one('3. Email Sam (10m)')).toEqual({ title: 'Email Sam', minutes: 10, kind: 'note' });
  });
  it('a lone "h" or "m" is not an estimate', () => {
    expect(one('Vitamin h')).toEqual({ title: 'Vitamin h', kind: 'note' });
    expect(one('Room m')).toEqual({ title: 'Room m', kind: 'note' });
    expect(one('h')).toEqual({ title: 'h', kind: 'note' });
  });
  it('a number glued into a word is not an estimate', () => {
    expect(one('Buy 3mm screws').minutes).toBeUndefined();
    expect(one('Order a1h part').minutes).toBeUndefined();
    expect(one('Version 2.5.1h build').minutes).toBeUndefined();
    expect(one('Call 3 mothers').minutes).toBeUndefined();
    expect(one('Read 30 minutesaday book').minutes).toBeUndefined();
  });
  it('a plain number or "30 m" with a space is not an estimate', () => {
    expect(one('Buy 30 eggs').minutes).toBeUndefined();
    expect(one('Walk 30 m to the shop').minutes).toBeUndefined();
  });
  it('1h followed by words is just 1h', () => {
    expect(one('Wait 1h 30 emails')).toEqual({ title: 'Wait 30 emails', minutes: 60, kind: 'note' });
  });
  it('rejects zero, over 24 hours, and a decimal with minutes; the text stays', () => {
    expect(one('Nap 0m')).toEqual({ title: 'Nap 0m', kind: 'note' });
    expect(one('Sleep 25h')).toEqual({ title: 'Sleep 25h', kind: 'note' });
    expect(one('Sleep 1500 min')).toEqual({ title: 'Sleep 1500 min', kind: 'note' });
    expect(one('Sleep 1.5h30')).toEqual({ title: 'Sleep 1.5h30', kind: 'note' });
    expect(one('Sleep 24h').minutes).toBe(1440);
  });
  it('rounds a fractional estimate to whole minutes', () => {
    expect(one('Task 0.33h').minutes).toBe(20);
    expect(one('Task 0.01h').minutes).toBe(1);
  });
  it('with several estimates the last one is read and the others stay in the title', () => {
    expect(one('Read 20m of the book 1h')).toEqual({ title: 'Read 20m of the book', minutes: 60, kind: 'note' });
  });
  it('a line that is only an estimate keeps its text as the title', () => {
    expect(one('30m')).toEqual({ title: '30m', kind: 'note' });
    expect(one('- (45m)')).toEqual({ title: '(45m)', kind: 'note' });
  });
});

describe('parseBrainDump: limits', () => {
  it('keeps at most IMPORT_MAX_CARDS drafts (the first ones)', () => {
    const text = Array.from({ length: IMPORT_MAX_CARDS + 50 }, (_, i) => `task ${i}`).join('\n');
    const drafts = parseBrainDump(text);
    expect(drafts).toHaveLength(IMPORT_MAX_CARDS);
    expect(drafts[0].title).toBe('task 0');
    expect(drafts[IMPORT_MAX_CARDS - 1].title).toBe(`task ${IMPORT_MAX_CARDS - 1}`);
  });
  it('blank lines do not count toward the cap', () => {
    const text = Array.from({ length: IMPORT_MAX_CARDS }, (_, i) => `task ${i}\n\n`).join('');
    expect(parseBrainDump(text)).toHaveLength(IMPORT_MAX_CARDS);
  });
  it('cuts a very long title at the same length journal names use', () => {
    const d = one('x'.repeat(NOTE_NAME_MAX + 500));
    expect(d.title).toBe('x'.repeat(NOTE_NAME_MAX));
  });
  it('counts characters, so an emoji is not cut in half, and trims after the cut', () => {
    const d = one('😀'.repeat(NOTE_NAME_MAX + 5));
    expect(Array.from(d.title)).toHaveLength(NOTE_NAME_MAX);
    expect(one(`${'a'.repeat(NOTE_NAME_MAX - 1)} bcd`).title).toBe('a'.repeat(NOTE_NAME_MAX - 1));
  });
  it('reads the estimate before cutting a long title', () => {
    const d = one(`${'y'.repeat(NOTE_NAME_MAX + 50)} 30m`);
    expect(d.minutes).toBe(30);
    expect(d.title).toBe('y'.repeat(NOTE_NAME_MAX));
  });
  it('handles a very large single line without hanging', () => {
    const t = Date.now();
    parseBrainDump(`${'1 '.repeat(100000)}30m`);
    expect(Date.now() - t).toBeLessThan(2000);
  });
});

describe('draftCards', () => {
  it('makes a note card from a note draft and a checklist from a checkbox draft, in order', () => {
    const cards = draftCards(parseBrainDump('Buy milk\n[ ] Pack bag'));
    expect(cards).toHaveLength(2);
    expect(cards[0]).toMatchObject({ kind: 'note', text: 'Buy milk' });
    expect(cards[1]).toMatchObject({ kind: 'todo', title: 'Pack bag' });
    if (cards[1].kind === 'todo') expect(cards[1].items).toHaveLength(1);
  });
  it('gives every card its own id', () => {
    const cards = draftCards(parseBrainDump('a\nb\nc\n[ ] d'));
    expect(new Set(cards.map((c) => c.id)).size).toBe(4);
  });
  it('keeps the estimate off the card, because the save format has no place for it yet', () => {
    const cards = draftCards(parseBrainDump('Write report 1h30\n[ ] Pack bag (20m)'));
    expect(JSON.stringify(cards)).not.toMatch(/minutes|estimate/);
  });
  it('gives nothing for nothing', () => {
    expect(draftCards([])).toEqual([]);
    expect(draftCards(parseBrainDump('  \n\n'))).toEqual([]);
  });
});

describe('minutesLabel', () => {
  it('writes minutes, whole hours, and hours with minutes', () => {
    expect(minutesLabel(30)).toBe('30 min');
    expect(minutesLabel(60)).toBe('1 h');
    expect(minutesLabel(90)).toBe('1 h 30 min');
    expect(minutesLabel(1440)).toBe('24 h');
    expect(minutesLabel(5)).toBe('5 min');
  });
});
