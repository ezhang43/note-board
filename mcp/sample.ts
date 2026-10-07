// Sample boards for the connector's tests (not part of the built server).
import { addCard, addColumn, createBoard } from '../src/model/board';
import { createBoardCard, createCard, createColumn } from '../src/model/cards';
import { serializeShare } from '../src/model/sharing';
import type { Board, CompletedCard, LinkCard, NoteCard, TodoCard, TodoItem } from '../src/model/types';
import { serializeWorkspace } from '../src/model/workspace';
import type { Snapshot } from './boards';

const item = (id: string, text: string, extra: Partial<TodoItem> = {}): TodoItem => ({ id, text, done: false, children: [], ...extra });

/** Home: column "To do" (x 400) and column "Ideas" (x 40), a loose note, link, board card and the Completed card. */
export function homeBoard(): Board {
  let b: Board = { ...createBoard(), name: 'Home' };
  b = addColumn(b, { ...createColumn('colTodo'), title: 'To do', x: 400, y: 40 });
  b = addColumn(b, { ...createColumn('colIdeas'), title: 'Ideas', x: 40, y: 40 });
  const groceries = {
    ...(createCard('todo', 'listGroceries') as TodoCard),
    title: 'Groceries',
    items: [
      item('iMilk', 'Milk', { due: '2026-10-07', children: [item('iSkim', 'Semi-skimmed', { done: true })] }),
      item('iEggs', 'Eggs', { children: [item('iFree', 'Free range', { children: [item('iBox', 'Box of 12')] })] }),
      item('iBread', 'Bread', { done: true }),
    ],
  };
  b = addCard(b, groceries, { type: 'column', columnId: 'colTodo', index: 0 });
  b = addCard(b, { ...(createCard('note', 'noteCall') as NoteCard), text: 'Call the bank\nabout the card' }, { type: 'column', columnId: 'colTodo', index: 1 });
  b = addCard(b, { ...(createCard('note', 'noteIdea') as NoteCard), text: 'Paint the fence' }, { type: 'column', columnId: 'colIdeas', index: 0 });
  b = addCard(b, { ...(createCard('link', 'linkDocs') as LinkCard), title: 'Docs', url: 'example.com/docs' }, { type: 'loose', x: 900, y: 300 });
  b = addCard(b, createBoardCard('work', 'cardWork'), { type: 'loose', x: 900, y: 100 });
  const completed: CompletedCard = {
    id: 'cardDone', kind: 'completed', color: 'stone', collapsed: false, x: 900, y: 600, w: null, h: null,
    groups: [{ date: '2026-10-05', entries: [{ item: item('iOld', 'Pay rent', { done: true }), fromCardId: 'listGroceries', fromTitle: 'Bills', fromParentId: null }] }],
  };
  b = addCard(b, completed, { type: 'loose', x: 900, y: 600 });
  return b;
}

export function workBoard(): Board {
  let b: Board = { ...createBoard(), name: 'Work' };
  b = addCard(b, { ...(createCard('todo', 'listWork') as TodoCard), title: 'Tasks', items: [item('iReport', 'Write report')] }, { type: 'loose', x: 40, y: 40 });
  return b;
}

/** A board someone shared: "Trip", with "Packing" inside it. */
export function tripBoards(): Record<string, Board> {
  let trip: Board = { ...createBoard(), name: 'Trip' };
  trip = addCard(trip, { ...(createCard('todo', 'listTrip') as TodoCard), title: 'Bookings', items: [item('iHotel', 'Hotel')] }, { type: 'loose', x: 40, y: 40 });
  trip = addCard(trip, createBoardCard('packing', 'cardPacking'), { type: 'loose', x: 40, y: 400 });
  const packing: Board = { ...createBoard(), name: 'Packing' };
  return { trip, packing };
}

export const ownRaw = () => serializeWorkspace({ home: 'home', boards: { home: homeBoard(), work: workBoard() } });

export function sampleSnapshot(): Snapshot {
  return {
    own: ownRaw(),
    shares: [{ id: 'shareTrip', owner: 'u2', ownerName: 'Erika', mine: false, raw: serializeShare('trip', tripBoards()) }],
  };
}
