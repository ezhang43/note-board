import { describe, expect, it } from 'vitest';
import { validate } from './ai';
import {
  AI_BATCH,
  AI_ITEM_MAX,
  AI_LABEL_MAX,
  AI_MAX_CATEGORIES,
  AI_MAX_PER_PRESS,
  LABELS_SCHEMA,
  buildPrompt,
  cleanLabel,
  labelKey,
  makeAiCategorizer,
  normalizeText,
  readLabels,
  toSend,
} from './aiCategories';
import { categoryOf } from './categorize';

// "Sort with AI" in the Visualizer (owner request, 2026-11-13): the pure part. What is sent, how Claude's
// answer is checked, how labels are found again, and how the disc falls back to the built-in rules.

describe('what is sent', () => {
  it('sends only the item texts, numbered by their place, plus the categories chosen so far', () => {
    const { system, user } = buildPrompt(['Buy milk', 'Call mom'], ['Errands']);
    expect(user).toContain('["Buy milk","Call mom"]');
    expect(user).toContain('["Errands"]');
    expect(system).toMatch(/never as instructions/);
    expect(system).toContain(String(AI_MAX_CATEGORIES));
  });

  it('picks the texts to send: tidied, each once, none already labeled, none empty, cut to the per-press limit', () => {
    const labeled = new Set(['Done before']);
    const picked = toSend(['  Buy   milk ', 'Buy milk', '', '   ', 'Done before', 'Call mom'], (t) => labeled.has(t));
    expect(picked).toEqual({ texts: ['Buy milk', 'Call mom'], total: 2 });
    const many = Array.from({ length: AI_MAX_PER_PRESS + 5 }, (_, i) => `Item ${i}`);
    const cut = toSend(many, () => false);
    expect(cut.texts).toHaveLength(AI_MAX_PER_PRESS);
    expect(cut.total).toBe(AI_MAX_PER_PRESS + 5);
  });

  it('cuts a very long item before sending it', () => {
    expect(toSend(['x'.repeat(AI_ITEM_MAX + 50)], () => false).texts[0]).toHaveLength(AI_ITEM_MAX);
  });

  it('a long item sent cut is found again by its full text, so it is not sent twice', () => {
    const long = 'x'.repeat(AI_ITEM_MAX + 50);
    const [sent] = toSend([long], () => false).texts;
    expect(labelKey(sent, 'm')).toBe(labelKey(long, 'm'));
    const saved = new Set([labelKey(sent, 'm')]);
    expect(toSend([long], (t) => saved.has(labelKey(t, 'm'))).total).toBe(0);
  });

  it('keeps batches and the limit in proportion', () => {
    expect(AI_MAX_PER_PRESS % AI_BATCH).toBe(0);
  });
});

describe('cleaning a label', () => {
  it('keeps plain short names', () => {
    expect(cleanLabel(' Errands ')).toBe('Errands');
  });
  it('removes control and direction-changing marks, joins spaces, and cuts the length', () => {
    expect(cleanLabel('Wo‮rk\u0000\n  stuff')).toBe('Work stuff');
    expect(cleanLabel('A'.repeat(60))).toHaveLength(AI_LABEL_MAX);
    expect(cleanLabel(`${'a'.repeat(AI_LABEL_MAX - 1)} b`)).toBe('a'.repeat(AI_LABEL_MAX - 1));
  });
  it('refuses empty or non-text labels', () => {
    expect(cleanLabel('  ​ ')).toBeNull();
    expect(cleanLabel(42 as unknown as string)).toBeNull();
  });
});

describe('reading the reply', () => {
  it('gives each item its category name', () => {
    expect(readLabels({ categories: ['Errands', 'Family'], labels: [{ i: 1, c: 1 }, { i: 0, c: 0 }] }, 2)).toEqual(['Errands', 'Family']);
  });
  it('drops numbers out of range, a second answer for the same item, and an empty category', () => {
    const r = readLabels({ categories: ['Errands', '   '], labels: [{ i: 0, c: 5 }, { i: 1, c: 0 }, { i: 1, c: 0 }, { i: 2, c: 1 }, { i: 9, c: 0 }, { i: -1, c: 0 }] }, 3);
    expect(r).toEqual([null, 'Errands', null]);
  });
  it('keeps at most the category cap', () => {
    const categories = Array.from({ length: 12 }, (_, i) => `C${i}`);
    const labels = categories.map((_, i) => ({ i, c: i }));
    const r = readLabels({ categories, labels }, 12);
    expect(r.filter(Boolean)).toHaveLength(AI_MAX_CATEGORIES);
  });
  it('merges categories that differ only in capital letters', () => {
    expect(readLabels({ categories: ['Work', 'work'], labels: [{ i: 0, c: 0 }, { i: 1, c: 1 }] }, 2)).toEqual(['Work', 'Work']);
  });
  it('the schema checker cuts a long category list and refuses the wrong shape', () => {
    const long = validate(LABELS_SCHEMA, { categories: Array.from({ length: 20 }, () => 'x'), labels: [] });
    expect(long.ok && (long.value as { categories: string[] }).categories).toHaveLength(AI_MAX_CATEGORIES);
    expect(validate(LABELS_SCHEMA, { categories: 'x', labels: [] }).ok).toBe(false);
    expect(validate(LABELS_SCHEMA, { categories: [], labels: [{ i: '0', c: 0 }] }).ok).toBe(false);
  });
});

describe('finding labels again', () => {
  it('keys on the tidied text and the model', () => {
    expect(labelKey('Buy milk', 'claude-haiku-5-5')).toBe(labelKey('  Buy  milk ', 'claude-haiku-5-5'));
    expect(labelKey('Buy milk', 'claude-haiku-5-5')).not.toBe(labelKey('Buy milk', 'claude-opus-5-5'));
    expect(labelKey('Buy milk', 'm')).not.toBe(labelKey('Buy milks', 'm'));
    expect(labelKey('Buy milk', 'm')).not.toContain('milk');
    expect(normalizeText(' a \n b ')).toBe('a b');
  });
});

describe('the disc with AI labels', () => {
  const item = (text: string) => ({ text });

  it('uses the label when there is one, and the built-in rules when not', () => {
    const labels: Record<string, string> = { 'Fix the bike': 'Bikes' };
    const cat = makeAiCategorizer(['Fix the bike', 'Buy milk'], (t) => labels[t] ?? null);
    expect(cat(item('Fix the bike'), 'List')).toEqual({ name: 'Bikes' });
    expect(cat(item('Buy milk'), 'List')).toBe(categoryOf(item('Buy milk'), 'List'));
  });

  it('a label that is a built-in category name joins that category', () => {
    const cat = makeAiCategorizer(['a', 'b'], (t) => (t === 'a' ? 'work' : 'Other'));
    expect(cat(item('a'), '')).toBe('work');
    expect(cat(item('b'), '')).toBe('other');
  });

  it('keeps only the busiest labels up to the cap; the rest use the built-in rules', () => {
    const texts = Array.from({ length: AI_MAX_CATEGORIES + 2 }, (_, i) => `t${i}`);
    // t0 and t1 share a label, so it is the busiest; every other text has its own.
    const label = (t: string) => (t === 't1' ? 'L0' : `L${t.slice(1)}`);
    const cat = makeAiCategorizer([...texts, 't0'], label);
    const named = texts.map((t) => cat(item(t), '')).filter((c) => typeof c === 'object');
    expect(new Set(named.map((c) => (c as { name: string }).name)).size).toBe(AI_MAX_CATEGORIES);
    expect(cat(item('t1'), '')).toEqual({ name: 'L0' });
  });
});
