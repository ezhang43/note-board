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
