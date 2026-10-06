import { shownName } from './board';
import { hrefOf } from './cards';
import type { Board, Card, TodoItem } from './types';

// Backup (owner request, 2026-10-05): the board as readable text (Markdown), to keep or paste
// elsewhere. The full backup (every position, size and colour) is the saved JSON itself.

function items(list: TodoItem[], depth = 0): string[] {
  return list.flatMap((it) => [`${'    '.repeat(depth)}- [${it.done ? 'x' : ' '}] ${it.text}`, ...items(it.children, depth + 1)]);
}

/** A board's name by its id (for board cards). */
export type BoardNameOf = (boardId: string) => string;

function cardText(card: Card, nameOf: BoardNameOf): string[] {
  switch (card.kind) {
    case 'board':
      return [`Board: ${shownName(nameOf(card.boardId))}`];
    case 'note':
      return card.text.trim() ? [card.text.trim()] : [];
    case 'link': {
      const href = hrefOf(card.url);
      if (!href) return card.title.trim() ? [card.title.trim()] : [];
      return [card.title.trim() ? `[${card.title.trim()}](${href})` : href];
    }
    case 'todo':
      return [`### ${card.title.trim() || 'List'}`, '', ...items(card.items)];
    case 'completed':
      return [
        '### Completed',
        ...card.groups.flatMap((g) => ['', `#### ${g.date}`, '', ...g.entries.flatMap((e) => items([e.item]).map((line, i) => (i === 0 && e.fromTitle ? `${line} (from ${e.fromTitle})` : line)))]),
      ];
  }
}

/** The board as Markdown: its name, each column (left to right) with its cards, then the loose cards top to bottom. */
export function boardAsMarkdown(board: Board, nameOf: BoardNameOf = () => ''): string {
  const out: string[] = [`# ${board.name.trim() || 'Board'}`, ''];
  const block = (lines: string[]) => lines.length && out.push(...lines, '');
  const columns = board.order.filter((id) => board.columns[id]).sort((a, b) => board.columns[a].x - board.columns[b].x || board.columns[a].y - board.columns[b].y);
  for (const id of columns) {
    const col = board.columns[id];
    out.push(`## ${col.title.trim() || 'Untitled column'}`, '');
    for (const cardId of col.cardIds) if (board.cards[cardId]) block(cardText(board.cards[cardId], nameOf));
  }
  const loose = board.order.filter((id) => board.cards[id]).sort((a, b) => board.cards[a].y - board.cards[b].y || board.cards[a].x - board.cards[b].x);
  if (loose.length) {
    if (columns.length) out.push('## On the board', '');
    for (const id of loose) block(cardText(board.cards[id], nameOf));
  }
  return out.join('\n');
}

/** "BusyAnts - Home - 2026-10-05.json": the board's name (without characters files can't have) and the day. */
export function backupFileName(boardName: string, day: Date, ext: 'json' | 'md'): string {
  const name = boardName.replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim() || 'Board';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `BusyAnts - ${name} - ${day.getFullYear()}-${pad(day.getMonth() + 1)}-${pad(day.getDate())}.${ext}`;
}
