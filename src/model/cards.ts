import type { ColorKey } from './palette';
import type { Card, CardKind, Column, TodoItem } from './types';
import { COLUMN_W } from './constants';

export const DEFAULT_COLOR: Record<CardKind, ColorKey> = { note: 'butter', todo: 'mint', link: 'sky' };

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
      return { ...base, kind, title: 'New list', items: [createItem()], completedOpen: true };
    case 'link':
      return { ...base, kind, title: '', url: '' };
  }
}

export function createColumn(id = newId('c')): Column {
  return { id, title: 'New column', x: 0, y: 0, w: COLUMN_W, h: null, color: null, collapsed: false, cardIds: [] };
}

export function countItems(items: TodoItem[]): { total: number; done: number } {
  let total = 0;
  let done = 0;
  for (const it of items) {
    total += 1;
    if (it.done) done += 1;
    const c = countItems(it.children);
    total += c.total;
    done += c.done;
  }
  return { total, done };
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

/** "2/5 done" in a to-do list's header. Empty for other cards. */
export function progressText(card: Card): string {
  if (card.kind !== 'todo') return '';
  const { total, done } = countItems(card.items);
  return total ? `${done}/${total} done` : '';
}

/** The one-line preview a collapsed card shows. */
export function collapsedPreview(card: Card): string {
  switch (card.kind) {
    case 'note':
      return card.text.split('\n')[0];
    case 'todo': {
      const { total, done } = countItems(card.items);
      return `${card.title || 'List'} · ${done}/${total}`;
    }
    case 'link':
      return card.title || domainOf(card.url) || '';
  }
}

