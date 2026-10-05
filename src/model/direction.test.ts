import { describe, expect, it } from 'vitest';
import { nearestInDirection } from './geometry';

// Ctrl+arrow: which card is "next" in a direction.
//
//   [left]   [from]   [right]   [far right]
//            [below]
//            [far below]          [off to the side, lower]

const from = { x: 300, y: 100, w: 240, h: 100 };
const cards = [
  { id: 'left', rect: { x: 0, y: 100, w: 240, h: 100 } },
  { id: 'right', rect: { x: 600, y: 110, w: 240, h: 100 } },
  { id: 'far right', rect: { x: 900, y: 100, w: 240, h: 100 } },
  { id: 'below', rect: { x: 300, y: 220, w: 240, h: 120 } },
  { id: 'far below', rect: { x: 300, y: 400, w: 240, h: 100 } },
  { id: 'side', rect: { x: 900, y: 230, w: 240, h: 100 } },
];

describe('nearest card in a direction', () => {
  it('picks the nearest card straight ahead', () => {
    expect(nearestInDirection(from, cards, 'right')).toBe('right');
    expect(nearestInDirection(from, cards, 'left')).toBe('left');
    expect(nearestInDirection(from, cards, 'down')).toBe('below');
  });

  it('prefers a card straight ahead over a nearer one off to the side', () => {
    expect(nearestInDirection(from, cards, 'down')).toBe('below');
    const onlyAside = [cards[5], cards[4]];
    expect(nearestInDirection(from, onlyAside, 'down')).toBe('far below');
  });

  it('returns nothing when there is no card that way', () => {
    expect(nearestInDirection(from, cards, 'up')).toBeNull();
    expect(nearestInDirection(cards[2].rect, cards.slice(0, 2), 'right')).toBeNull();
  });

  it('moves card by card down a column', () => {
    expect(nearestInDirection(cards[3].rect, cards, 'down')).toBe('far below');
    expect(nearestInDirection(cards[4].rect, cards, 'up')).toBe('below');
  });
});

// Owner report (2026-10-05): Alt + arrows went the wrong way, e.g. Alt+→ landed on a card that was
// mostly below. A card or column only counts when it lies wholly in that direction.
describe('nearest card in a direction: only blocks wholly that way', () => {
  const start = { x: 0, y: 0, w: 300, h: 100 };
  const lowerRight = { id: 'lower right', rect: { x: 160, y: 110, w: 240, h: 100 } };
  const right = { id: 'right', rect: { x: 340, y: 0, w: 240, h: 100 } };

  it('a card that starts below is "down", not "right", even if it reaches further right', () => {
    expect(nearestInDirection(start, [lowerRight, right], 'right')).toBe('right');
    expect(nearestInDirection(start, [lowerRight, right], 'down')).toBe('lower right');
  });

  it('a card overlapping the start sideways is a step up or down, never left or right', () => {
    const above = [{ id: 'start', rect: start }];
    expect(nearestInDirection(lowerRight.rect, above, 'left')).toBeNull();
    expect(nearestInDirection(lowerRight.rect, above, 'up')).toBe('start');
  });

  // Two columns side by side, each with a title strip and cards below it:
  //   [A title]  [B title]
  //   [A1     ]  [B1     ]
  //   [A2     ]  [B2     ]
  const aTitle = { id: 'A', rect: { x: 0, y: 0, w: 280, h: 48 } };
  const a1 = { id: 'A1', rect: { x: 8, y: 56, w: 264, h: 120 } };
  const a2 = { id: 'A2', rect: { x: 8, y: 184, w: 264, h: 200 } };
  const bTitle = { id: 'B', rect: { x: 300, y: 0, w: 280, h: 48 } };
  const b1 = { id: 'B1', rect: { x: 308, y: 56, w: 264, h: 260 } };
  const b2 = { id: 'B2', rect: { x: 308, y: 324, w: 264, h: 80 } };
  const all = [aTitle, a1, a2, bTitle, b1, b2];
  const others = (r: { id: string }) => all.filter((c) => c !== r);

  it('Down from a column title goes to its first card; Up from the first card goes back to the title', () => {
    expect(nearestInDirection(aTitle.rect, others(aTitle), 'down')).toBe('A1');
    expect(nearestInDirection(a1.rect, others(a1), 'up')).toBe('A');
  });

  it('Down / Up step card by card through a column', () => {
    expect(nearestInDirection(a1.rect, others(a1), 'down')).toBe('A2');
    expect(nearestInDirection(a2.rect, others(a2), 'up')).toBe('A1');
    expect(nearestInDirection(a2.rect, others(a2), 'down')).toBeNull();
  });

  it('Right / Left go to the next column at the same height: title to title, card to card', () => {
    expect(nearestInDirection(aTitle.rect, others(aTitle), 'right')).toBe('B');
    expect(nearestInDirection(bTitle.rect, others(bTitle), 'left')).toBe('A');
    expect(nearestInDirection(a2.rect, others(a2), 'right')).toBe('B1');
    expect(nearestInDirection(b2.rect, others(b2), 'left')).toBe('A2');
    expect(nearestInDirection(b1.rect, others(b1), 'right')).toBeNull();
  });
});

describe('nearest card in a direction: straight ahead first', () => {
  it('Alt+← from a card beside a column lands on the card level with it, not the slightly nearer column title above', () => {
    const beside = { x: 940, y: 424, w: 240, h: 154 };
    const title = { id: 'title', rect: { x: 581, y: 365, w: 278, h: 52 } };
    const card = { id: 'card', rect: { x: 597, y: 417, w: 246, h: 154 } };
    expect(nearestInDirection(beside, [title, card], 'left')).toBe('card');
  });
});
