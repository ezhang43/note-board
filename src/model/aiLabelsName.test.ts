import { describe, expect, it } from 'vitest';
import { AI_LABELS_NAME, aiLabelsOwner, dropAiLabelsUnlessFor, readAiLabels } from './aiLabelsName';

// The Sort with AI labels' saved form, read in one place (code review, 2026-11-15): the label cache, the
// sign-in watcher and Delete account agree on whose they are and on what counts as damaged.

const memory = (value?: string) => {
  const data = new Map<string, string>(value === undefined ? [] : [[AI_LABELS_NAME, value]]);
  data.set('note-board:ai-model', 'm');
  return { data, storage: { getItem: (k: string) => data.get(k) ?? null, removeItem: (k: string) => void data.delete(k) } as unknown as Storage };
};
const saved = (owner: unknown, extra: object = {}) => JSON.stringify({ v: 1, owner, entries: { abc: 'Errands' }, ...extra });

describe('reading the saved labels', () => {
  it('gives whose they are and the labels, for the saved form only', () => {
    expect(readAiLabels(saved('u1'))).toEqual({ owner: 'u1', entries: { abc: 'Errands' } });
    expect(aiLabelsOwner(saved('u1'))).toBe('u1');
    expect(aiLabelsOwner(saved(''))).toBe('');
  });

  it('anything else is damaged (null): not JSON, another version, no owner, entries that are not an object', () => {
    for (const raw of [null, '{', 'null', '[]', saved('u1', { v: 2 }), saved(5), saved('u1', { entries: [] }), saved('u1', { entries: null })]) expect(readAiLabels(raw)).toBeNull();
  });
});

describe('dropAiLabelsUnlessFor (the sign-in watcher)', () => {
  it('keeps the same person’s labels; removes anyone else’s, damaged ones, and all of them on sign-out; never another entry', () => {
    const cases: [string | undefined, string | null, boolean][] = [
      [saved('u1'), 'u1', true],
      [saved('u1'), 'u2', false],
      [saved('u1'), null, false],
      [saved(''), null, false],
      ['{', 'u1', false],
      [saved('u1', { v: 2 }), 'u1', false],
      [undefined, 'u1', false],
    ];
    for (const [value, uid, kept] of cases) {
      const { data, storage } = memory(value);
      dropAiLabelsUnlessFor(() => storage, uid);
      expect(data.has(AI_LABELS_NAME)).toBe(kept);
      expect(data.get('note-board:ai-model')).toBe('m');
    }
  });

  it('blocked storage is skipped', () => {
    expect(() =>
      dropAiLabelsUnlessFor(() => {
        throw new Error('blocked');
      }, null),
    ).not.toThrow();
  });
});
