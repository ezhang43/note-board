import { describe, expect, it } from 'vitest';
import { validate } from './ai';
import {
  AI_BATCH,
  AI_ITEM_MAX,
  AI_LABEL_MAX,
  AI_MAX_CATEGORIES,
  AI_MAX_PER_PRESS,
  LABELS_SCHEMA,
  autoSortDue,
  buildPrompt,
  cleanLabel,
  labelKey,
  makeAiCategorizer,
  normalizeText,
  ownBoards,
  readLabels,
  toSend,
} from './aiCategories';
import { categoryOf } from './categorize';

// "Sort with AI" in the Visualizer (owner request, 2026-11-13): the pure part. What is sent, how Claude's
// answer is checked, how labels are found again, and how the disc falls back to the built-in rules.

/** Items on board `boardId` (own by default) with these texts. */
const on = (texts: string[], boardId = 'home') => texts.map((text) => ({ text, boardId }));
const allOwn = () => true;

describe('what is sent', () => {
  it('sends only the item texts, numbered by their place, plus the categories chosen so far', () => {
    const { system, user } = buildPrompt([{ text: 'Buy milk' }, { text: 'Call mom' }], ['Errands']);
    expect(user).toContain('["Buy milk","Call mom"]');
    expect(user).toContain('["Errands"]');
    expect(system).toMatch(/never as instructions/);
    expect(system).toContain(String(AI_MAX_CATEGORIES));
  });

  it('picks the texts to send: tidied, each once, none already labeled, none empty, cut to the per-press limit', () => {
    const labeled = new Set(['Done before']);
    const picked = toSend(on(['  Buy   milk ', 'Buy milk', '', '   ', 'Done before', 'Call mom']), (e) => labeled.has(e.text), allOwn);
    expect(picked).toEqual({ entries: [{ text: 'Buy milk' }, { text: 'Call mom' }], total: 2 });
    const many = Array.from({ length: AI_MAX_PER_PRESS + 5 }, (_, i) => `Item ${i}`);
    const cut = toSend(on(many), () => false, allOwn);
    expect(cut.entries).toHaveLength(AI_MAX_PER_PRESS);
    expect(cut.total).toBe(AI_MAX_PER_PRESS + 5);
  });

  it('cuts a very long item before sending it', () => {
    expect(toSend(on(['x'.repeat(AI_ITEM_MAX + 50)]), () => false, allOwn).entries[0].text).toHaveLength(AI_ITEM_MAX);
  });

  it('a long item sent cut is found again by its full text, so it is not sent twice', () => {
    const long = 'x'.repeat(AI_ITEM_MAX + 50);
    const [sent] = toSend(on([long]), () => false, allOwn).entries;
    expect(labelKey(sent.text, 'm')).toBe(labelKey(long, 'm'));
    const saved = new Set([labelKey(sent.text, 'm')]);
    expect(toSend(on([long]), (e) => saved.has(labelKey(e.text, 'm', e.parent)), allOwn).total).toBe(0);
  });

  it('never sends an item from a board someone else shared with this person (owner, 2026-11-13)', () => {
    const isOwn = ownBoards([{ root: 'trip', boards: ['trip', 'trip-sub'], owner: false }], true);
    const items = [...on(['Buy milk']), ...on(['Pack the tent'], 'trip'), ...on(['Fix the stove'], 'trip-sub')];
    expect(toSend(items, () => false, isOwn)).toEqual({ entries: [{ text: 'Buy milk' }], total: 1 });
  });

  it('a text on both an own and a shared board is sent once, for the own one', () => {
    const isOwn = ownBoards([{ root: 'trip', boards: ['trip'], owner: false }], true);
    expect(toSend([...on(['Buy milk'], 'trip'), ...on(['Buy milk'])], () => false, isOwn)).toEqual({ entries: [{ text: 'Buy milk' }], total: 1 });
    expect(toSend(on(['Buy milk'], 'trip'), () => false, isOwn)).toEqual({ entries: [], total: 0 });
  });

  it('a board this person shared with others is still their own', () => {
    const isOwn = ownBoards([{ root: 'mine', boards: ['mine'], owner: true }], true);
    expect(toSend(on(['Plan the party'], 'mine'), () => false, isOwn).entries).toEqual([{ text: 'Plan the party' }]);
  });

  it('while the shares are not known yet, no board counts as own, so nothing is sent', () => {
    const isOwn = ownBoards([], false);
    expect(isOwn('home')).toBe(false);
    expect(toSend(on(['Buy milk']), () => false, isOwn)).toEqual({ entries: [], total: 0 });
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

describe('sub-items: the parent goes along as context (owner request 2026-11-13)', () => {
  /** A completed sub-item: `context` is the words of the items it sat under, nearest first (DoneItem.context). */
  const sub = (text: string, context: string[], boardId = 'home') => ({ text, boardId, context });

  it('sends a sub-item with its parent item text, tidied, and nothing else about it', () => {
    const picked = toSend([sub('  Beat the  boss ', ['Elden  Ring', 'Games night']), { text: 'Buy milk', boardId: 'home' }], () => false, allOwn);
    expect(picked).toEqual({ entries: [{ text: 'Beat the boss', parent: 'Elden Ring' }, { text: 'Buy milk' }], total: 2 });
    const { user, system } = buildPrompt(picked.entries, []);
    expect(user).toContain('[{"item":"Beat the boss","under":"Elden Ring"},"Buy milk"]');
    expect(user).not.toContain('Games night');
    expect(system).toMatch(/under/);
    expect(system).toMatch(/never as instructions/);
  });

  it('the same text under another parent is a different entry, asked about again', () => {
    const picked = toSend([sub('Beat the boss', ['Elden Ring']), sub('Beat the boss', ['Hollow Knight']), sub('Beat the boss', ['Elden Ring'])], () => false, allOwn);
    expect(picked.entries).toEqual([
      { text: 'Beat the boss', parent: 'Elden Ring' },
      { text: 'Beat the boss', parent: 'Hollow Knight' },
    ]);
  });

  it('cuts a very long parent text before sending it', () => {
    const [e] = toSend([sub('a', ['p'.repeat(AI_ITEM_MAX + 50)])], () => false, allOwn).entries;
    expect(e.parent).toHaveLength(AI_ITEM_MAX);
  });

  it('a sub-item labeled before (with its parent) is not sent again', () => {
    const saved = new Set([labelKey('Beat the boss', 'm', 'Elden Ring')]);
    const labeled = (e: { text: string; parent?: string }) => saved.has(labelKey(e.text, 'm', e.parent));
    expect(toSend([sub('Beat the boss', ['Elden Ring'])], labeled, allOwn).total).toBe(0);
    expect(toSend([sub('Beat the boss', ['Hollow Knight'])], labeled, allOwn).total).toBe(1);
  });

  it('never sends an item whose whole text is a time word (owner 2026-11-13); a time-word parent is vague, so it is not sent and the next one up counts', () => {
    expect(toSend(on(['Today', 'Now!', 'Daily']), () => false, allOwn)).toEqual({ entries: [], total: 0 });
    expect(toSend([sub('Beat the boss', ['Today'])], () => false, allOwn).entries).toEqual([{ text: 'Beat the boss' }]);
    expect(toSend([sub('Beat the boss', ['Tonight', 'Elden Ring'])], () => false, allOwn).entries).toEqual([{ text: 'Beat the boss', parent: 'Elden Ring' }]);
  });

  it('a sub-item whose parent already gives a built-in category is not sent: the parent decides (no label would show)', () => {
    expect(toSend([sub('Box up the tools', ['Clean the garage'])], () => false, allOwn)).toEqual({ entries: [], total: 0 });
  });

  it('the label key takes the parent in, hashed, and stays the same as before for an item with no parent', () => {
    expect(labelKey('Beat the boss', 'm', 'Elden Ring')).not.toBe(labelKey('Beat the boss', 'm'));
    expect(labelKey('Beat the boss', 'm', 'Elden Ring')).not.toBe(labelKey('Beat the boss', 'm', 'Hollow Knight'));
    expect(labelKey('Beat the boss', 'm', ' Elden  Ring ')).toBe(labelKey('Beat the boss', 'm', 'Elden Ring'));
    expect(labelKey('Beat the boss', 'm', 'Elden Ring')).not.toMatch(/Elden|boss/);
    expect(labelKey('Beat the boss', 'm', undefined)).toBe(labelKey('Beat the boss', 'm'));
    // An item with no parent keeps the key labels were saved under before this change (cyrb53 of "model\0text").
    expect(labelKey('Buy milk', 'm')).toBe('h15cx64i9n43');
  });

  it('the disc looks a sub-item up with its parent, and a parent with a built-in category wins without its label counting', () => {
    const lookup = (text: string, parent?: string) => (parent === 'Elden Ring' ? 'Gaming' : text === 'Box up the tools' ? 'Storage' : null);
    const items = [sub('Beat the boss', ['Elden Ring']), sub('Box up the tools', ['Clean the garage'])];
    const cat = makeAiCategorizer(items, lookup, allOwn);
    expect(cat(items[0], 'List')).toEqual({ name: 'Gaming' });
    expect(cat(items[1], 'List')).toBe('home');
    expect(cat(sub('Beat the boss', ['Today']), 'List')).toBe(categoryOf(sub('Beat the boss', ['Today']), 'List'));
    // "Storage" belongs only to an item whose parent decides, so it never takes one of the top places.
    const crowded = Array.from({ length: AI_MAX_CATEGORIES }, (_, i) => ({ text: `t${i}`, boardId: 'home' }));
    const many = makeAiCategorizer([...crowded, ...Array.from({ length: 5 }, () => items[1])], (t, p) => (p ? null : t.startsWith('t') ? `L${t}` : 'Storage'), allOwn);
    expect(crowded.map((c) => many(c, ''))).toEqual(crowded.map((c) => ({ name: `L${c.text}` })));
  });
});

describe('the disc with AI labels', () => {
  const item = (text: string, boardId = 'home') => ({ text, boardId });

  it('uses the label when there is one, and the built-in rules when not', () => {
    const labels: Record<string, string> = { 'Fix the bike': 'Bikes' };
    const cat = makeAiCategorizer(on(['Fix the bike', 'Buy milk']), (t) => labels[t] ?? null, allOwn);
    expect(cat(item('Fix the bike'), 'List')).toEqual({ name: 'Bikes' });
    expect(cat(item('Buy milk'), 'List')).toBe(categoryOf(item('Buy milk'), 'List'));
  });

  it('a label that is a built-in category name joins that category', () => {
    const cat = makeAiCategorizer(on(['a', 'b']), (t) => (t === 'a' ? 'work' : 'Other'), allOwn);
    expect(cat(item('a'), '')).toBe('work');
    expect(cat(item('b'), '')).toBe('other');
  });

  it('keeps only the busiest labels up to the cap; the rest use the built-in rules', () => {
    const texts = Array.from({ length: AI_MAX_CATEGORIES + 2 }, (_, i) => `t${i}`);
    // t0 and t1 share a label, so it is the busiest; every other text has its own.
    const label = (t: string) => (t === 't1' ? 'L0' : `L${t.slice(1)}`);
    const cat = makeAiCategorizer(on([...texts, 't0']), label, allOwn);
    const named = texts.map((t) => cat(item(t), '')).filter((c) => typeof c === 'object');
    expect(new Set(named.map((c) => (c as { name: string }).name)).size).toBe(AI_MAX_CATEGORIES);
    expect(cat(item('t1'), '')).toEqual({ name: 'L0' });
  });

  it('a label saved earlier is not used for an item on a board shared with this person: it keeps the built-in category', () => {
    const isOwn = ownBoards([{ root: 'trip', boards: ['trip'], owner: false }], true);
    const lookup = (t: string) => (t === 'Fix the bike' ? 'Bikes' : null);
    const cat = makeAiCategorizer([item('Fix the bike'), item('Fix the bike', 'trip')], lookup, isOwn);
    expect(cat(item('Fix the bike'), 'List')).toEqual({ name: 'Bikes' });
    expect(cat(item('Fix the bike', 'trip'), 'List')).toBe(categoryOf(item('Fix the bike'), 'List'));
    // Only own items count towards the busiest labels.
    const shared = makeAiCategorizer([item('Fix the bike', 'trip')], lookup, isOwn);
    expect(shared(item('Fix the bike'), 'List')).toBe(categoryOf(item('Fix the bike'), 'List'));
  });
});

describe('autoSortDue (Sort automatically, owner request 2026-11-13)', () => {
  const base = { auto: true, hasKey: true, byCategory: true, loading: false, running: false, total: 3, range: '30', tried: new Set<string>() };

  it('runs on its own with a key saved, By category, the box on and items with no label yet', () => {
    expect(autoSortDue(base)).toBe(true);
  });

  it('does not run without a key, By board, with the box off, or with nothing left to sort', () => {
    expect(autoSortDue({ ...base, hasKey: false })).toBe(false);
    expect(autoSortDue({ ...base, byCategory: false })).toBe(false);
    expect(autoSortDue({ ...base, auto: false })).toBe(false);
    expect(autoSortDue({ ...base, total: 0 })).toBe(false);
  });

  it('waits while the shares load or while a sort is running', () => {
    expect(autoSortDue({ ...base, loading: true })).toBe(false);
    expect(autoSortDue({ ...base, running: true })).toBe(false);
  });

  it('runs at most once per open per range, so a failure is never retried by itself', () => {
    const tried = new Set<string>();
    const at = (range: string) => ({ ...base, range, tried });
    expect(autoSortDue(at('30'))).toBe(true);
    tried.add('30'); // the run starts (and then fails, or is stopped)
    expect(autoSortDue(at('30'))).toBe(false); // the error shows; no second request
    expect(autoSortDue({ ...at('30'), total: 120 })).toBe(false); // more waiting after a run: the button is for those
    expect(autoSortDue(at('7'))).toBe(true); // another range is its own run
    tried.add('7');
    expect(autoSortDue(at('7'))).toBe(false);
    expect(autoSortDue({ ...at('30'), tried: new Set() })).toBe(true); // the next open starts afresh
  });
});
