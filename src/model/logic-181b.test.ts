import { describe, expect, it } from 'vitest';
import * as B from './board';
import { createCard } from './cards';
import { freeSpot, overlaps } from './geometry';
import { resizeFrom } from './sizing';
import { EXAMPLE, TEMPLATES, templateBoard } from './templates';
import { GRID } from './constants';
import { eventsOnDay } from './calendar';
import { boardAsMarkdown } from './exportText';
import { returnPushes } from './placement';
import { blockRect, settle, snapAll } from './layout';
import { findItem, indentItem, indentItems, insertItems, outdentItems } from './checklist';
import { cleanUp, completedCardOf, restoreEntry } from './completed';
import { findMatches } from './search';
import { applyStyle, boxesOf } from './textStyle';
import type { Board, CompletedCard, LinkCard, Rect, TodoCard, TodoItem } from './types';

// Board-logic review 181 (part B), model findings reproduced first, then fixed (job 183).

const item = (id: string, children: TodoItem[] = [], done = false): TodoItem => ({ id, text: id, done, children });
const list = (id: string, items: TodoItem[], title = ''): TodoCard => ({ ...(createCard('todo', id) as TodoCard), title, items });
let n = 0;
const mk = (p: string) => `${p}${++n}`;
const loose = { type: 'loose', x: 500, y: 0 } as const;

const record = (id: string, date: string, text: string): CompletedCard => ({
  id,
  kind: 'completed',
  color: 'stone',
  collapsed: false,
  x: 0,
  y: 0,
  w: null,
  h: null,
  groups: [{ date, entries: [{ item: item(text, [], true), fromCardId: 'gone', fromTitle: 'Old', fromParentId: null }] }],
});

/** Two devices each did their first Clean up before syncing: the board keeps both Completed records. */
function twoRecords(): Board {
  let b = B.addCard(B.createBoard(), record('r1', '2026-10-01', 'apple'), { type: 'loose', x: 0, y: 0 });
  b = B.addCard(b, record('r2', '2026-10-02', 'banana'), { type: 'loose', x: 0, y: 0 });
  return b;
}

describe('B-M4: Tab, Shift+Tab and formatting on a big selection stay quick', () => {
  // Big enough that the old code took many seconds, with a budget loose enough for a busy computer.
  const N = 3000;
  const many = Array.from({ length: N }, (_, i) => item(`i${i}`));
  const ids = many.map((i) => i.id);
  const timed = <T,>(f: () => T): [T, number] => {
    const t = performance.now();
    const out = f();
    return [out, performance.now() - t];
  };

  it('Tab on 3,000 items gives the same result as one at a time, quickly', () => {
    const [out, ms] = timed(() => indentItems(many, ids));
    expect(out).toHaveLength(1);
    expect(out![0].children).toHaveLength(N - 1);
    expect(ms).toBeLessThan(3000);
  }, 60000);

  it('Shift+Tab on 3,000 nested items is quick too', () => {
    const nested = [{ ...item('top'), children: many }];
    const [out, ms] = timed(() => outdentItems(nested, ids));
    expect(out).toHaveLength(N + 1);
    expect(ms).toBeLessThan(3000);
  }, 60000);

  it('bold on 3,000 items is one change, quickly, and leaves the input alone', () => {
    const b = B.addCard(B.createBoard(), list('L', many), { type: 'loose', x: 0, y: 0 });
    const [out, ms] = timed(() => applyStyle(b, boxesOf(b, ['L']), { bold: true }));
    expect((out.cards.L as TodoCard).items.every((i) => i.style?.bold)).toBe(true);
    expect((b.cards.L as TodoCard).items[0].style).toBeUndefined();
    expect(ms).toBeLessThan(3000);
  }, 60000);
});

describe('B-M5: the free-spot search stays quick on a big pile', () => {
  const pile = (n: number): Board => {
    let b = B.createBoard();
    for (let i = 0; i < n; i++) b = B.addCard(b, { ...createCard('note', `n${i}`), w: null, h: null }, { type: 'loose', x: 0, y: 0 });
    return b;
  };

  it('freeSpot meets few blocks, however many there are (counted, not timed)', () => {
    // 300 blocks in a 20 x 15 field of 250 x 110 cells, with the one in the middle left out: the nearest
    // free spot is close, but the old search tested every block for every spot on the way.
    let reads = 0;
    const others = Array.from({ length: 300 }, (_, i) => {
      const r = { x: (i % 20) * 250, y: Math.floor(i / 20) * 110, w: 240, h: 100 };
      return { ...r, get x() { reads++; return r.x; } };
    }).filter((_, i) => i !== 150);
    freeSpot({ x: 10 * 250, y: 7 * 110, w: 480, h: 100 }, others, 10, 20);
    expect(reads).toBeLessThan(20000);
  });

  it('300 blocks on one spot end up apart', () => {
    const out = settle(pile(300), () => undefined);
    const rects = out.order.map((id) => blockRect(out, id, () => undefined)!);
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) if (overlaps(rects[i], rects[j], 9)) throw new Error(`${i} and ${j} are too close`);
  }, 60000);

  it('freeSpot finds the same spot as the plain ring-by-ring search it replaced', () => {
    // The plain search: every cell of each ring's square, ties to the first found.
    const plain = (rect: Rect, others: Rect[], gap: number, step: number) => {
      const hits = (r: Rect) => others.some((o) => overlaps(r, o, gap));
      if (!hits(rect)) return { x: rect.x, y: rect.y };
      for (let ring = 1; ring <= 400; ring++) {
        let best: { x: number; y: number; d: number } | null = null;
        for (let dx = -ring; dx <= ring; dx++)
          for (let dy = -ring; dy <= ring; dy++) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
            const c = { ...rect, x: rect.x + dx * step, y: rect.y + dy * step };
            if (hits(c)) continue;
            const d = (dx * step) ** 2 + (dy * step) ** 2;
            if (!best || d < best.d) best = { x: c.x, y: c.y, d };
          }
        if (best) return { x: best.x, y: best.y };
      }
      return { x: rect.x, y: rect.y };
    };
    let seed = 7;
    const rnd = (n: number) => Math.floor(((seed = (seed * 16807) % 2147483647) / 2147483647) * n);
    for (let run = 0; run < 200; run++) {
      const step = run % 2 ? 20 : 10;
      const others = Array.from({ length: 1 + rnd(25) }, () => ({ x: rnd(30) * step - 100, y: rnd(30) * step - 100, w: 100 + rnd(30) * 10, h: 60 + rnd(20) * 10 }));
      const rect = { x: rnd(20) * step, y: rnd(20) * step, w: 80 + rnd(25) * 10, h: 60 + rnd(10) * 10 };
      expect(freeSpot(rect, others, 10, step)).toEqual(plain(rect, others, 10, step));
    }
  });

  it('a spot that is already free stays; a tie goes to the first found', () => {
    expect(freeSpot({ x: 500, y: 0, w: 240, h: 100 }, [{ x: 0, y: 0, w: 240, h: 100 }], 10, 20)).toEqual({ x: 500, y: 0 });
    const others = [{ x: 0, y: 0, w: 240, h: 100 }, { x: 250, y: 0, w: 240, h: 100 }];
    expect(freeSpot({ x: 0, y: 0, w: 240, h: 100 }, others, 10, 20)).toEqual({ x: 0, y: -120 });
  });
});

describe('B-M3: an open item never ends up under a ticked one', () => {
  const tree = () => [item('G', [item('milk', [], true), item('eggs')])];
  const done = (items: TodoItem[], id: string) => findItem(items, id)!.item.done;

  it('Tab on an open item under a ticked sibling unticks that sibling', () => {
    const out = indentItem(tree(), 'eggs')!;
    expect(findItem(out, 'eggs')!.parent!.id).toBe('milk');
    expect(done(out, 'milk')).toBe(false);
    expect(done(out, 'eggs')).toBe(false);
  });

  it('Tab on several selected items does the same', () => {
    const items = [item('G', [item('milk', [], true), item('eggs'), item('jam')])];
    const out = indentItems(items, ['eggs', 'jam'])!;
    expect(findItem(out, 'jam')!.parent!.id).toBe('milk');
    expect(done(out, 'milk')).toBe(false);
  });

  it('unticks every ticked item above it, up to the top', () => {
    const items = [item('A', [item('B', [item('x', [], true), item('open')], true)], true)];
    const out = indentItem(items, 'open')!;
    expect(['A', 'B', 'x'].map((id) => done(out, id))).toEqual([false, false, false]);
  });

  it('a ticked item can still be nested under a ticked one', () => {
    const items = [item('G', [item('milk', [], true), item('tea', [], true)])];
    const out = indentItem(items, 'tea')!;
    expect(done(out, 'milk')).toBe(true);
    expect(done(out, 'tea')).toBe(true);
  });

  it('dropping an open item nested under a ticked one unticks it', () => {
    const out = insertItems([item('milk', [], true), item('eggs')], { mode: 'nest', targetId: 'milk' }, [item('x')])!;
    expect(done(out, 'milk')).toBe(false);
    expect(done(out, 'x')).toBe(false);
  });

  it('dropping a ticked item nested under a ticked one changes nothing else', () => {
    const out = insertItems([item('milk', [], true)], { mode: 'nest', targetId: 'milk' }, [item('x', [], true)])!;
    expect(done(out, 'milk')).toBe(true);
  });

  it('so Clean up no longer sweeps away an item that was never ticked', () => {
    const out = indentItem(tree(), 'eggs')!;
    let b = B.addCard(B.createBoard(), list('L', out), { type: 'loose', x: 0, y: 0 });
    b = cleanUp(b, '2026-10-02', loose, mk).board;
    expect(findItem((b.cards.L as TodoCard).items, 'eggs')).not.toBeNull();
  });
});

describe('B-L10: template containers sit on the grid, 20px apart', () => {
  it('every container of every template is on the 20px grid, with the gap between neighbors', () => {
    for (const t of [...TEMPLATES, EXAMPLE]) {
      const cols = Object.values(templateBoard(t).columns).sort((a, b) => a.x - b.x);
      for (const c of cols) expect(c.x % GRID).toBe(0);
      cols.slice(1).forEach((c, i) => expect(c.x - (cols[i].x + cols[i].w)).toBe(20));
    }
  });
});

describe('B-L11: a zero-length event at exactly midnight', () => {
  const ev = (start: string, end: string) => ({ id: 'e', title: 'Midnight', start, end, allDay: false, calendarId: 'c' }) as never;
  it('is listed on the day it starts, and not on the day before', () => {
    const e = ev('2026-10-22T00:00', '2026-10-22T00:00');
    expect(eventsOnDay([e], '2026-10-22')).toHaveLength(1);
    expect(eventsOnDay([e], '2026-10-21')).toHaveLength(0);
  });
});

describe('B-L13: Download as text keeps a multi-line item in its item, and "]" in a link title', () => {
  it('writes the later lines of an item indented under it, so the list does not end', () => {
    let b = B.addCard(B.createBoard(), list('L', [item('a\nb'), item('c', [item('d\ne')])]), { type: 'loose', x: 0, y: 0 });
    b = { ...b, name: 'Home' };
    const text = boardAsMarkdown(b);
    expect(text).toContain('- [ ] a\n      b\n- [ ] c\n    - [ ] d\n          e');
  });

  it('escapes "[" and "]" in a link title', () => {
    const b = B.addCard(B.createBoard(), { ...(createCard('link', 'l') as LinkCard), title: 'a [b] c', url: 'https://example.com' }, { type: 'loose', x: 0, y: 0 });
    expect(boardAsMarkdown(b)).toContain('[a \\[b\\] c](https://example.com/)');
  });
});

describe('B-L8: the resize label after a left or top re-snap', () => {
  it('keeps "same height as N blocks" when only the width part changes', () => {
    const r = resizeFrom('card', 'nw', { x: 310, y: 300, w: 240, h: 200 }, { x: -7, y: 20 }, [{ id: 'o', w: 500, h: 180 }], true);
    expect(r.matchIds).toEqual(['o']);
    expect(r.w).toBe(250);
    expect(r.label).toBe('250 × 180 · same height as 1 block');
  });
});

describe('B-L3: collapsing returns pushed blocks without stacking them', () => {
  const at = (b: Board, id: string, y: number) => B.addCard(b, { ...createCard('note', id), w: null, h: 100 }, { type: 'loose', x: 0, y });
  const setup = () => {
    let b = at(B.createBoard(), 'X', 0);
    for (const [id, y] of [['c', 120], ['P1', 240], ['P2', 360]] as const) b = at(b, id, y);
    return b;
  };
  const pushes = (order: string[]) =>
    new Map(order.map((id) => [id, id === 'P1' ? { from: { x: 0, y: 120 }, to: { x: 0, y: 240 } } : { from: { x: 0, y: 240 }, to: { x: 0, y: 360 } }]));
  const heightOf = (id: string) => (id === 'X' ? 100 : 100);

  for (const order of [['P1', 'P2'], ['P2', 'P1']]) {
    it(`P1 cannot go back (c is in its spot), so P2 stays clear of it (pushed ${order.join(' then ')})`, () => {
      const out = returnPushes(setup(), pushes(order), 'X', heightOf);
      expect(out.cards.P1.y).toBe(240);
      expect(out.cards.P2.y).toBe(360);
    });
  }
});

describe('B-L7: turning Snap on', () => {
  it('snaps a collapsed height too, and adds none to a card that has none', () => {
    let b = B.addCard(B.createBoard(), { ...createCard('note', 'a'), collapsedH: 73 }, { type: 'loose', x: 0, y: 0 });
    b = B.addCard(b, createCard('note', 'b'), { type: 'loose', x: 400, y: 0 });
    const out = snapAll(b);
    expect(out.cards.a.collapsedH).toBe(80);
    expect('collapsedH' in out.cards.b).toBe(false);
  });
});

describe('B-L6: Clean up or restore into a container that is gone', () => {
  const gone = { type: 'column', columnId: 'gone', index: 0 } as const;

  it('Clean up still makes a whole Completed record', () => {
    const b = B.addCard(B.createBoard(), list('g', [item('milk', [], true)]), { type: 'loose', x: 0, y: 0 });
    const r = cleanUp(b, '2026-10-02', gone, mk);
    expect(r.count).toBe(1);
    expect(B.problems(r.board)).toEqual([]);
    expect(completedCardOf(r.board)!.kind).toBe('completed');
  });

  it('restoring an item whose list is gone still makes the list', () => {
    const r = restoreEntry(twoRecords(), 'apple', gone, mk);
    expect(r.cardId).not.toBeNull();
    expect(B.problems(r.board)).toEqual([]);
    expect(r.board.cards[r.cardId!].kind).toBe('todo');
    expect(completedCardOf(r.board)!.groups.flatMap((g) => g.entries.map((e) => e.item.id))).toEqual(['banana']);
  });
});

describe('B-M2: a second Completed record', () => {
  it('shows the items of every record, newest day first, and Find sees them', () => {
    const b = twoRecords();
    expect(completedCardOf(b)!.groups.map((g) => g.date)).toEqual(['2026-10-02', '2026-10-01']);
    expect(findMatches(b, 'banana')).toHaveLength(1);
    expect(findMatches(b, 'apple')).toHaveLength(1);
  });

  it('gives the same object for the same board (a store selector may rely on it)', () => {
    const b = twoRecords();
    expect(completedCardOf(b)).toBe(completedCardOf(b));
  });

  it('Clean up folds the records into one and keeps every item', () => {
    let b = twoRecords();
    b = B.addCard(b, list('g', [item('milk', [], true)]), { type: 'loose', x: 0, y: 300 });
    const r = cleanUp(b, '2026-10-02', loose, mk);
    expect(Object.values(r.board.cards).filter((c) => c.kind === 'completed')).toHaveLength(1);
    const all = completedCardOf(r.board)!.groups.flatMap((g) => g.entries.map((e) => `${g.date}:${e.item.id}`));
    expect(all.sort()).toEqual(['2026-10-01:apple', '2026-10-02:banana', '2026-10-02:milk']);
    expect(B.problems(r.board)).toEqual([]);
  });

  it('restoring an item from the second record works and leaves one record', () => {
    const r = restoreEntry(twoRecords(), 'banana', loose, mk);
    expect(r.cardId).not.toBeNull();
    expect(Object.values(r.board.cards).filter((c) => c.kind === 'completed')).toHaveLength(1);
    expect(completedCardOf(r.board)!.groups.flatMap((g) => g.entries.map((e) => e.item.id))).toEqual(['apple']);
    expect(B.problems(r.board)).toEqual([]);
  });
});
