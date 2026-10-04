import type { ColorKey } from './palette';
import type { BoardCard, Card, CardKind, Column, TodoItem } from './types';
import { COLUMN_W } from './constants';

export const DEFAULT_COLOR: Record<CardKind, ColorKey> = { note: 'butter', todo: 'mint', link: 'sky' };

/** Makes a new id with the given prefix (tests pass a predictable one). */
export type MakeId = (prefix: string) => string;

export function newId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().slice(0, 8)}`;
}

export function createItem(id = newId('i')): TodoItem {
  return { id, text: '', done: false, children: [] };
}

export function createCard(kind: CardKind, id = newId('k')): Card {
  const base = { id, color: DEFAULT_COLOR[kind], collapsed: false, x: 0, y: 0, w: null, h: null };
  switch (kind) {
    case 'note':
      return { ...base, kind, text: '' };
    case 'todo':
      return { ...base, kind, title: '', items: [createItem()], completedOpen: true };
    case 'link':
      return { ...base, kind, title: '', url: '' };
  }
}

/** A card that opens board `boardId`. */
export function createBoardCard(boardId: string, id = newId('k')): BoardCard {
  return { id, kind: 'board', boardId, color: 'stone', collapsed: false, x: 0, y: 0, w: null, h: null };
}

export function createColumn(id = newId('c')): Column {
  return { id, title: '', x: 0, y: 0, w: COLUMN_W, h: null, color: null, collapsed: false, cardIds: [] };
}

/** A card that can never be deleted or copied: the board's one Completed card (owner rule). */
export function isPermanent(card: Card): boolean {
  return card.kind === 'completed';
}

/** The address a link opens. Only http(s) links are ever opened; bare addresses get https://. */
export function hrefOf(url: string): string | null {
  const u = url.trim();
  if (!u) return null;
  const full = /^https?:\/\//i.test(u) ? u : `https://${u}`;
  try {
    const parsed = new URL(full);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:' ? parsed.href : null;
  } catch {
    return null;
  }
}

export function domainOf(url: string): string | null {
  const href = hrefOf(url);
  return href ? new URL(href).hostname.replace(/^www\./, '') : null;
}

/** The one-line preview a collapsed card shows. */
export function collapsedPreview(card: Card): string {
  switch (card.kind) {
    case 'note':
      return card.text.split('\n')[0];
    case 'todo':
      return card.title || 'List';
    case 'completed':
      return 'Completed';
    case 'link':
      return card.title || domainOf(card.url) || '';
    case 'board':
      return 'Board';
  }
}

