import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LinkCard } from '../model/types';
import { createStore } from './store';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

function setup() {
  const s = createStore(null);
  s.setViewportSize({ width: 1200, height: 800 });
  return s;
}

describe('adding a link card from a pasted or dropped address (job 124)', () => {
  it('adds a selected link card at the middle of the screen, as one undo step', () => {
    const s = setup();
    const before = s.getState().board;
    expect(s.addLinkCard('https://example.com/pic.png')).toBe(true);
    const { board, ui } = s.getState();
    const id = ui.selection[0];
    const card = board.cards[id] as LinkCard;
    expect(card.kind).toBe('link');
    expect(card.url).toBe('https://example.com/pic.png');
    expect(Object.keys(board.cards)).toHaveLength(1);
    s.undo();
    expect(s.getState().board.cards).toEqual(before.cards);
    s.redo();
    expect(s.getState().board.cards[id]).toBeDefined();
  });

  it('puts the card where it was dropped, centred on the pointer', () => {
    const s = setup();
    s.addLinkCard('https://example.com/', { x: 1000, y: 600 });
    const card = s.getState().board.cards[s.getState().ui.selection[0]];
    expect(card.x).toBeGreaterThan(800);
    expect(card.y).toBeGreaterThan(450);
  });

  it('refuses an address that is not http(s), changing nothing', () => {
    const s = setup();
    const before = s.getState().board;
    for (const bad of ['javascript:alert(1)', 'data:image/png;base64,AAAA', 'example.com', 'file:///a.png']) expect(s.addLinkCard(bad)).toBe(false);
    expect(s.getState().board).toBe(before);
  });

  it('goes at the end of the container it was dropped on, wherever the pointer is', () => {
    const s = setup();
    s.addColumn();
    const colId = s.getState().ui.selection[0];
    s.clearSelection();
    s.addLinkCard('https://example.com/a', { x: 9000, y: 9000 }, colId);
    const { board, ui } = s.getState();
    expect(board.columns[colId].cardIds).toEqual(ui.selection);
    expect(Object.keys(board.cards)).toHaveLength(1);
  });

  it('goes into the selected container', () => {
    const s = setup();
    s.addColumn();
    const colId = s.getState().ui.selection[0];
    s.addLinkCard('https://example.com/');
    expect(s.getState().board.columns[colId].cardIds).toHaveLength(1);
  });
});
