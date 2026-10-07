import { createCard, createItem, type MakeId } from './cards';
import type { Card, TodoItem } from './types';

// JSON exports from other apps (owner, 2026-10-06): a Trello board export and Google Keep notes
// (Google Takeout). Anything else gives null (refused with a note). Every value is only read as
// text: nothing is run, shown as HTML or loaded.

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const arr = (v: unknown) => (Array.isArray(v) ? v.filter(isObj) : []);
const byPos = (a: Obj, b: Obj) => (Number(a.pos) || 0) - (Number(b.pos) || 0);

/** Cards from a Trello or Google Keep export, or null when the JSON is neither (or broken). */
export function readJson(text: string, makeId: MakeId): Card[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text.replace(/^﻿/, ''));
  } catch {
    return null;
  }
  if (isObj(data) && Array.isArray(data.lists) && Array.isArray(data.cards)) return trello(data, makeId);
  const notes = (Array.isArray(data) ? data : [data]).filter((n): n is Obj => isObj(n) && (typeof n.textContent === 'string' || Array.isArray(n.listContent)));
  return notes.length ? notes.flatMap((n) => keepNote(n, makeId)) : null;
}

const item = (text: string, done: boolean, makeId: MakeId, children: TodoItem[] = []): TodoItem => ({ ...createItem(makeId('i')), text, done, children });

/**
 * Each open list → a checklist titled with its name; its open cards → items (ticked when marked
 * complete), a card's checklists → sub-items (one checklist: its items; several: one sub-item per
 * checklist with its items under it). A card's description → a note after its list.
 */
function trello(data: Obj, makeId: MakeId): Card[] {
  const checklists = arr(data.checklists).sort(byPos);
  const cards = arr(data.cards).filter((c) => c.closed !== true).sort(byPos);
  return arr(data.lists)
    .filter((l) => l.closed !== true)
    .sort(byPos)
    .flatMap((list) => {
      const notes: Card[] = [];
      const items = cards
        .filter((c) => c.idList === list.id && list.id !== undefined)
        .map((c) => {
          const lists = checklists
            .filter((k) => k.idCard === c.id)
            .map((k) => ({ name: str(k.name), items: arr(k.checkItems).sort(byPos).map((i) => item(str(i.name), i.state === 'complete', makeId)) }));
          const children = lists.length === 1 ? lists[0].items : lists.map((k) => item(k.name, false, makeId, k.items));
          const desc = str(c.desc).trim();
          if (desc) notes.push(note(`${str(c.name)}\n${desc}`, makeId));
          return item(str(c.name), c.dueComplete === true, makeId, children);
        });
      return [todo(str(list.name), items.length ? items : [createItem(makeId('i'))], makeId), ...notes];
    });
}

/** A Keep note: a list → a checklist with its ticks; text → a note (only a web address → a link); trashed → nothing. */
function keepNote(n: Obj, makeId: MakeId): Card[] {
  if (n.isTrashed === true) return [];
  const title = str(n.title).trim();
  if (Array.isArray(n.listContent)) return [todo(title, arr(n.listContent).map((i) => item(str(i.text), i.isChecked === true, makeId)), makeId)];
  const body = str(n.textContent).replace(/^\n+|\s+$/g, '');
  const url = /^\s*(https?:\/\/\S+)$/.exec(body)?.[1];
  if (url) {
    const card = createCard('link', makeId('k'));
    return card.kind === 'link' ? [{ ...card, title, url }] : [];
  }
  return title || body.trim() ? [note(title ? `${title}\n${body}` : body, makeId)] : [];
}

function todo(title: string, items: TodoItem[], makeId: MakeId): Card {
  const card = createCard('todo', makeId('k'));
  return card.kind === 'todo' ? { ...card, title, items: items.length ? items : [createItem(makeId('i'))] } : card;
}

function note(text: string, makeId: MakeId): Card {
  const card = createCard('note', makeId('k'));
  return card.kind === 'note' ? { ...card, text } : card;
}
