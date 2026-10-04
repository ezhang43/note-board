import { describe, expect, it } from 'vitest';
import { addCard, addColumn, createBoard, renameBoard } from './board';
import { createBoardCard, createCard, createColumn } from './cards';
import { backupFileName, boardAsMarkdown } from './exportText';
import type { LinkCard, NoteCard, TodoCard } from './types';

// Backup (owner request, 2026-10-05): a readable copy of the board as Markdown, alongside the
// full backup file.

function board() {
  let b = renameBoard(createBoard(), 'Home');
  b = addColumn(b, { ...createColumn('c1'), title: 'This week', x: 400, y: 0 });
  const list: TodoCard = {
    ...(createCard('todo', 't1') as TodoCard),
    title: 'Groceries',
    items: [
      { id: 'i1', text: 'Fruit', done: false, children: [{ id: 'i2', text: 'Apples', done: true, children: [] }] },
      { id: 'i3', text: 'Milk', done: true, children: [] },
    ],
  };
  b = addCard(b, list, { type: 'column', columnId: 'c1', index: 0 });
  b = addCard(b, { ...(createCard('note', 'n1') as NoteCard), text: 'Call the plumber\nabout the sink' }, { type: 'loose', x: 0, y: 300 });
  b = addCard(b, { ...(createCard('link', 'l1') as LinkCard), title: 'Recipe', url: 'example.com/soup' }, { type: 'loose', x: 0, y: 0 });
  return b;
}

describe('the board as readable text (Markdown)', () => {
  it('has the board name, each column with its cards, then the loose cards top to bottom', () => {
    expect(boardAsMarkdown(board())).toBe(
      [
        '# Home',
        '',
        '## This week',
        '',
        '### Groceries',
        '',
        '- [ ] Fruit',
        '    - [x] Apples',
        '- [x] Milk',
        '',
        '## On the board',
        '',
        '[Recipe](https://example.com/soup)',
        '',
        'Call the plumber',
        'about the sink',
        '',
      ].join('\n'),
    );
  });
});

describe('boards inside boards', () => {
  it('a board card is written as the name of the board it opens', () => {
    const b = addCard(renameBoard(createBoard(), 'Home'), createBoardCard('trips', 'k1'), { type: 'loose', x: 0, y: 0 });
    expect(boardAsMarkdown(b, (id) => (id === 'trips' ? 'Trips' : ''))).toBe('# Home\n\nBoard: Trips\n');
    expect(boardAsMarkdown(b)).toBe('# Home\n\nBoard: Untitled board\n');
  });
});

describe('backup file names', () => {
  it('name the board and the day, without characters files can’t have', () => {
    expect(backupFileName('Home: plans/ideas?', new Date(2026, 9, 5), 'json')).toBe('BusyAnts - Home plans ideas - 2026-10-05.json');
    expect(backupFileName('', new Date(2026, 0, 2), 'md')).toBe('BusyAnts - Board - 2026-01-02.md');
  });
});
