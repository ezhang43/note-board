import type { ColorKey } from './palette';

export type CardKind = 'note' | 'todo' | 'link';

interface CardBase {
  id: string;
  color: ColorKey;
  collapsed: boolean;
  /** Position on the board. Only used while the card is loose (not in a column). */
  x: number;
  y: number;
  /** Width and minimum height set by resizing; null = default width / fits its content. Ignored inside a column. */
  w: number | null;
  h: number | null;
}

export interface NoteCard extends CardBase {
  kind: 'note';
  text: string;
}

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  children: TodoItem[];
}

export interface TodoCard extends CardBase {
  kind: 'todo';
  title: string;
  items: TodoItem[];
}

export interface LinkCard extends CardBase {
  kind: 'link';
  title: string;
  url: string;
}

export type Card = NoteCard | TodoCard | LinkCard;

export interface Column {
  id: string;
  title: string;
  x: number;
  y: number;
  w: number;
  /** Minimum height set by resizing; null = the default minimum. */
  h: number | null;
  /** null = the neutral stone-grey a new column starts with. */
  color: ColorKey | null;
  collapsed: boolean;
  /** Cards in this column, top to bottom. */
  cardIds: string[];
}

/**
 * Board data: everything that is saved, and (from step 4) undoable.
 * Every card is in exactly one place: either listed in `order` (loose on the board)
 * or in one column's `cardIds`.
 */
export interface Board {
  name: string;
  snap: boolean;
  cards: Record<string, Card>;
  columns: Record<string, Column>;
  /** Top-level blocks (columns and loose cards), back to front. */
  order: string[];
}

export type Tool = 'hand' | 'select';

/**
 * How the board is being looked at. Not board data: never undoable.
 * panX / panY are the screen offset (in screen pixels) of the board's 0,0 point
 * from the top-left of the canvas area.
 */
export interface View {
  panX: number;
  panY: number;
  zoom: number;
  tool: Tool;
}

export interface Point {
  x: number;
  y: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}
