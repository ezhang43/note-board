import type { ColorKey } from './palette';
import type { FontSize } from './font';
import type { Theme } from './theme';

export type CardKind = 'note' | 'todo' | 'link';

/**
 * How one whole text box looks (owner request): left out = the usual Normal size, regular weight,
 * upright, Plex Sans. Only what differs is saved.
 */
export interface TextStyle {
  size?: 'small' | 'large';
  bold?: true;
  italic?: true;
  font?: 'serif' | 'rounded' | 'hand' | 'mono';
}

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
  /**
   * Colour picked for the card's title band (Colour button); missing / null = the usual band.
   * Cards themselves are always white.
   */
  titleColor?: ColorKey | null;
  /** Height while collapsed, if resized then (owner request); its open height (h) is kept apart. */
  collapsedH?: number | null;
  /** Format of the card's title (to-do list, link) or text (note). */
  style?: TextStyle;
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
  style?: TextStyle;
}

export interface TodoCard extends CardBase {
  kind: 'todo';
  title: string;
  items: TodoItem[];
  /** Whether the "Completed" section is expanded. */
  completedOpen: boolean;
}

export interface LinkCard extends CardBase {
  kind: 'link';
  title: string;
  url: string;
}

/** A ticked item moved into the Completed card by Clean up, with where it came from. */
export interface CompletedEntry {
  /** The item as it was (ticked), with its sub-items. */
  item: TodoItem;
  /** The list it came from, and its title then (used if that list is gone when it's restored). */
  fromCardId: string;
  fromTitle: string;
  /** The item it was nested under, or null if it was a top-level item. */
  fromParentId: string | null;
}

/** Items cleaned up on one day ("YYYY-MM-DD", the day Clean up was clicked). */
export interface CompletedGroup {
  date: string;
  entries: CompletedEntry[];
}

/**
 * The board's master Completed card (owner request): made by the first Clean up, and never deleted.
 * Groups are newest first.
 */
export interface CompletedCard extends CardBase {
  kind: 'completed';
  groups: CompletedGroup[];
}

/**
 * A card that opens another board (owner request: boards inside boards). Its name is that board's
 * name, so it has no title of its own.
 */
export interface BoardCard extends CardBase {
  kind: 'board';
  boardId: string;
}

export type Card = NoteCard | TodoCard | LinkCard | CompletedCard | BoardCard;

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
  /** Format of the column's title. */
  style?: TextStyle;
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
  /** Light or dark look: remembered per device under its own key, never undone or synced. */
  theme: Theme;
  /** Text size on cards and columns: per device, like the theme. */
  fontSize: FontSize;
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
