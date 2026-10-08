import { describe, expect, it } from 'vitest';
import { serializeBoard } from '../src/model/persist';
import { serializeWorkspace } from '../src/model/workspace';
import { boardOutline, collectBoards, findBoard, listBoardsText, safeToEdit } from './boards';
import { homeBoard, ownRaw, sampleSnapshot, workBoard } from './sample';

describe('collecting boards', () => {
  it('lists own boards (home first) and shared boards, marked read-only with who shared them', () => {
    const { entries } = collectBoards(sampleSnapshot());
    expect(entries.map((e) => [e.id, e.name, e.parent, e.home, e.sharedBy])).toEqual([
      ['home', 'Home', null, true, null],
      ['work', 'Work', 'home', false, null],
      ['trip', 'Trip', null, false, 'Erika'],
      ['packing', 'Packing', 'trip', false, 'Erika'],
    ]);
  });

  it('a board the owner shared says "you"', () => {
    const snap = sampleSnapshot();
    snap.shares[0] = { ...snap.shares[0], mine: true };
    expect(collectBoards(snap).entries.find((e) => e.id === 'trip')!.sharedBy).toBe('you');
  });

  it('nothing saved online yet gives no boards and says so', () => {
    const got = collectBoards({ own: null, shares: [] });
    expect(got.entries).toEqual([]);
    expect(listBoardsText(got)).toMatch(/No boards saved online yet/);
  });

  it('damaged own data is reported, shared boards still listed', () => {
    const got = collectBoards({ ...sampleSnapshot(), own: '{not json' });
    expect(got.entries.map((e) => e.id)).toEqual(['trip', 'packing']);
    expect(listBoardsText(got)).toMatch(/couldn.t be read/);
  });

  it('a shared board with the id of one of the owner’s boards is left out', () => {
    const snap = sampleSnapshot();
    snap.shares[0] = { ...snap.shares[0], raw: serializeWorkspace({ home: 'work', boards: { work: { ...workBoard(), name: 'Clash' } } }) };
    expect(collectBoards(snap).entries.map((e) => e.name)).toEqual(['Home', 'Work']);
  });
});

describe('list_boards text', () => {
  it('gives name, id, parent, home, shared and counts', () => {
    const text = listBoardsText(collectBoards(sampleSnapshot()));
    expect(text).toContain('- Home (id: home) [home board] — 2 columns, 6 cards, 4 open items');
    expect(text).toContain('- Work (id: work) inside Home — 0 columns, 1 card, 1 open item');
    expect(text).toContain('- Trip (id: trip) [shared by Erika, read-only] — 0 columns, 2 cards, 1 open item');
    expect(text).toContain('- Packing (id: packing) inside Trip [shared by Erika, read-only]');
  });
});

describe('finding a board', () => {
  const { entries } = collectBoards(sampleSnapshot());
  it('by id', () => expect(findBoard(entries, 'work')).toMatchObject({ entry: { id: 'work' } }));
  it('by name, ignoring case and spaces', () => expect(findBoard(entries, '  trip ')).toMatchObject({ entry: { id: 'trip' } }));
  it('an unknown name lists the boards', () => {
    const got = findBoard(entries, 'Nope');
    expect('error' in got && got.error).toMatch(/No board called "Nope".*Home \(id: home\)/s);
  });
  it('an ambiguous name returns the choices with ids', () => {
    const twins = [...entries, { ...entries[1], id: 'work2', parent: null }];
    const got = findBoard(twins, 'work');
    // An exact id still wins.
    expect(got).toMatchObject({ entry: { id: 'work' } });
    const byName = findBoard(twins, 'WORK ');
    expect('error' in byName && byName.error).toMatch(/2 boards are called "Work".*id: work\b.*id: work2/s);
  });
  it('an untitled board is found as "Untitled board"', () => {
    const blank = [{ ...entries[1], name: '' }];
    expect(findBoard(blank, 'untitled board')).toMatchObject({ entry: { id: 'work' } });
  });
});

describe('read_board outline', () => {
  const got = collectBoards(sampleSnapshot());
  const outline = (id: string) => boardOutline(got, got.entries.find((e) => e.id === id)!);

  it('columns left to right, cards top to bottom, then loose cards top to bottom', () => {
    const text = outline('home');
    const at = (s: string) => text.indexOf(s);
    expect(at('## Column: Ideas')).toBeGreaterThan(-1);
    expect(at('## Column: Ideas')).toBeLessThan(at('## Column: To do'));
    expect(at('Groceries')).toBeLessThan(at('Call the bank'));
    expect(at('## Loose cards')).toBeGreaterThan(at('Call the bank'));
    expect(at('Board card')).toBeLessThan(at('Link'));
    expect(at('Link')).toBeLessThan(at('Completed card'));
  });

  it('checklists show ticks, nesting, due dates and ids, with a Completed section', () => {
    const text = outline('home');
    expect(text).toContain('### Checklist: Groceries (id: listGroceries)');
    expect(text).toContain('- [ ] Milk (id: iMilk) (due 2026-10-07)\n  - [x] Semi-skimmed (id: iSkim)');
    expect(text).toContain('- [ ] Eggs (id: iEggs)\n  - [ ] Free range (id: iFree)\n    - [ ] Box of 12 (id: iBox)');
    expect(text).toContain('Completed:\n- [x] Bread (id: iBread)');
  });

  it('notes, links, board cards and the Completed card', () => {
    const text = outline('home');
    expect(text).toContain('### Note (id: noteCall)\n> Call the bank\n> about the card');
    expect(text).toContain('### Link: Docs (id: linkDocs) https://example.com/docs');
    expect(text).toContain('### Board card: Work (id: cardWork, opens board id: work)');
    expect(text).toContain('### Completed card (id: cardDone)\n#### 2026-10-05\n- [x] Pay rent (id: iOld) (from Bills)');
  });

  it('heads with the board and what can be done with it', () => {
    expect(outline('home').split('\n')[0]).toBe('# Home (id: home) [home board]');
    expect(outline('trip').split('\n')[0]).toBe('# Trip (id: trip) [shared by Erika, read-only]');
  });

  it('a board card to a board that isn’t there says so', () => {
    const snap = sampleSnapshot();
    const home = homeBoard();
    snap.own = serializeWorkspace({ home: 'home', boards: { home } });
    const g = collectBoards(snap);
    expect(boardOutline(g, g.entries[0])).toContain('### Board card: (a board that can’t be opened) (id: cardWork, opens board id: work)');
  });

  it('an empty board says so', () => {
    const g = collectBoards({ own: serializeWorkspace({ home: 'h', boards: { h: { ...workBoard(), cards: {}, order: [] } } }), shares: [] });
    expect(boardOutline(g, g.entries[0])).toContain('(This board is empty.)');
  });
});

describe('safe to edit (round trip)', () => {
  it('yes for data the app saved', () => expect(safeToEdit(ownRaw())).toEqual({ ok: true }));
  it('no when nothing is saved', () => expect(safeToEdit(null).ok).toBe(false));
  it('no for damaged data', () => expect(safeToEdit('{oops')).toMatchObject({ ok: false, reason: expect.stringMatching(/can.t be read/) }));
  it('no for an old single board', () => expect(safeToEdit(serializeBoard(homeBoard()))).toMatchObject({ ok: false, reason: expect.stringMatching(/older/) }));
  it('no when a newer app saved fields this connector doesn’t know', () => {
    const data = JSON.parse(ownRaw());
    data.boards.home.cards.noteIdea.sticker = 'star';
    expect(safeToEdit(JSON.stringify(data))).toMatchObject({ ok: false, reason: expect.stringMatching(/newer/) });
  });
  it('key order alone doesn’t matter', () => {
    const data = JSON.parse(ownRaw());
    const reordered = { boards: data.boards, home: data.home, version: data.version };
    expect(safeToEdit(JSON.stringify(reordered))).toEqual({ ok: true });
  });
});
