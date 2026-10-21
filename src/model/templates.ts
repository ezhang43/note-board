import { createBoard } from './board';
import { createCard, createColumn, createItem, newId } from './cards';
import { COLUMN_W } from './constants';
import type { ColorKey } from './palette';
import type { Board, NoteCard, TodoCard, TodoItem } from './types';

// Templates and the example board (owner request, job #162, 2026-10-22; picks: gallery from the Boards
// menu, tiles on an empty board). Each is an ordinary board in the saved format: nothing about saving
// changes, and a board made from one is saved, synced, backed up and undone like any other.
// Made up, in plain American English, no private details, no link cards (a link card loads a picture
// from a web address). Ids are made fresh each time one is used.

type Item = string | { text: string; done?: true; sub?: Item[] };
type Block = { note: string } | { list: string; items: Item[] };
interface Container {
  title: string;
  color: ColorKey;
  cards: Block[];
}
export interface Template {
  id: string;
  name: string;
  /** One line under the name on its tile. */
  blurb: string;
  containers: Container[];
}

const done = (text: string): Item => ({ text, done: true });

/** "Weekend in Lisbon": the same board as the About page's pictures. */
export const EXAMPLE: Template = {
  id: 'lisbon',
  name: 'Weekend in Lisbon',
  blurb: 'A finished plan to look around in. Tick things off, move cards around.',
  containers: [
    {
      title: 'Before we go',
      color: 'periwinkle',
      cards: [
        { list: 'To book', items: ['Book the flights', { text: 'Find a flat near Alfama', sub: ['Check the reviews', done('Ask Sam about dates')] }, done('Renew passport'), done('Buy travel adapter')] },
        { list: 'Packing', items: ['Walking shoes', 'Sunscreen', 'Light jacket', done('Camera charger')] },
      ],
    },
    {
      title: 'Saturday',
      color: 'sunflower',
      cards: [
        { list: 'Places to eat', items: ['Pastéis de nata in Belém', 'Time Out Market', 'Seafood in Cais do Sodré', done('Sunset drinks at the Miradouro')] },
        { note: 'Take tram 28 early, before the crowds.' },
      ],
    },
    { title: 'Sunday', color: 'mint', cards: [{ list: 'Day trip', items: ['Sintra palaces', 'Cascais beach', done('Train back by 6')] }] },
    { title: 'Ideas', color: 'peach', cards: [{ list: 'Maybe', items: ['Fado night in Alfama', 'Day at the aquarium'] }, { note: 'Ask the flat host about a late checkout.' }] },
  ],
};

export const TEMPLATES: Template[] = [
  {
    id: 'weekly',
    name: 'Weekly plan',
    blurb: 'Your top three, then the week day by day',
    containers: [
      { title: 'Top 3 this week', color: 'butter', cards: [{ note: 'Pick three things that would make this week a win.' }, { list: 'Priorities', items: ['Finish the report draft', 'Call the dentist', 'Plan Sunday dinner'] }] },
      { title: 'Monday to Wednesday', color: 'sky', cards: [{ list: 'Work', items: ['Reply to emails', 'Team check-in, Tuesday 10am', 'Draft the slides'] }, { list: 'Home', items: ['Laundry', 'Grocery run'] }] },
      { title: 'Thursday and Friday', color: 'mint', cards: [{ list: 'Work', items: ['Send the report', 'Tidy my desk'] }, { list: 'Me time', items: ['Gym class Thursday', 'Movie night Friday'] }] },
      { title: 'Weekend', color: 'peach', cards: [{ list: 'Fun', items: ['Farmers market', 'Hike with Sam'] }, { note: 'Leave one afternoon with nothing planned.' }] },
    ],
  },
  {
    id: 'project',
    name: 'Project plan',
    blurb: 'Goal, to do, doing and done in one view',
    containers: [
      { title: 'Goal and team', color: 'lavender', cards: [{ note: 'What are we making, and why? Write it in one or two sentences.' }, { list: 'Who does what', items: ['Me: planning and writing', 'Alex: design', 'Priya: review'] }] },
      { title: 'To do', color: 'sky', cards: [{ list: 'Next up', items: ['Write the outline', 'Gather what we need', 'Book a kickoff chat'] }] },
      { title: 'Doing', color: 'butter', cards: [{ list: 'In progress', items: ['Build the first draft'] }, { note: 'Stuck on something? Write it here so the team can help.' }] },
      { title: 'Done', color: 'mint', cards: [{ list: 'Finished', items: [done('Pick a name'), done('Agree on the goal')] }] },
    ],
  },
  {
    id: 'trip',
    name: 'Trip plan',
    blurb: 'Book, pack and plan each day',
    containers: [
      { title: 'Before we go', color: 'periwinkle', cards: [{ list: 'To book', items: ['Flights', 'Place to stay', 'Ride from the airport'] }, { list: 'Paperwork', items: ['Passport still valid?', 'Travel insurance'] }] },
      { title: 'Packing', color: 'sage', cards: [{ list: 'Clothes', items: ['Comfortable shoes', 'Light jacket', 'Swimsuit'] }, { list: 'Bits and bobs', items: ['Phone charger', 'Travel adapter', 'Sunscreen'] }] },
      { title: 'Day by day', color: 'butter', cards: [{ list: 'Day 1: arrive', items: ['Check in', 'Easy dinner nearby'] }, { list: 'Day 2', items: ['Morning walk', 'Museum'] }, { note: 'Leave a gap each afternoon for a nap or a wander.' }] },
      { title: 'Ideas and maybes', color: 'peach', cards: [{ list: 'Maybe', items: ['A day trip', 'Cooking class'] }, { note: 'Places friends recommended go here.' }] },
    ],
  },
  {
    id: 'reading',
    name: 'Reading list',
    blurb: 'Want to read, reading now, finished',
    containers: [
      { title: 'Want to read', color: 'lavender', cards: [{ list: 'Fiction', items: ['Pride and Prejudice, Jane Austen', 'Frankenstein, Mary Shelley'] }, { list: 'Non-fiction', items: ['Walden, Henry David Thoreau', 'A Room of One’s Own, Virginia Woolf'] }] },
      { title: 'Reading now', color: 'butter', cards: [{ list: 'On my nightstand', items: ['The Great Gatsby, F. Scott Fitzgerald'] }, { note: 'I’m on page 112. Good so far.' }] },
      { title: 'Finished', color: 'mint', cards: [{ list: 'Read it', items: [done('Little Women, Louisa May Alcott')] }, { note: 'Loved the ending. Four stars.' }] },
      { title: 'Favorite lines', color: 'peach', cards: [{ note: 'Add a line you want to remember, with the book’s name.' }] },
    ],
  },
  {
    id: 'mood',
    name: 'Mood board',
    blurb: 'Words, colors and things to collect',
    containers: [
      { title: 'The feeling', color: 'butter', cards: [{ note: 'Cozy, bright and a little playful. Like a Sunday morning at a sunny window.' }, { list: 'To collect', items: ['Paint swatches', 'Fabric scraps', 'Plant ideas', 'A photo of light I love'] }] },
      { title: 'Warm', color: 'peach', cards: [{ note: 'Honey, candlelight, wool blankets, terracotta.' }, { note: 'Tip: paste a picture’s web address into a link card and it shows up here.' }] },
      { title: 'Fresh', color: 'mint', cards: [{ note: 'Eucalyptus, linen, morning light, green apples.' }] },
      { title: 'Calm', color: 'sky', cards: [{ note: 'Rain on a window, soft denim, still water.' }] },
    ],
  },
  {
    id: 'study',
    name: 'Study plan',
    blurb: 'Classes, this week and exam prep',
    containers: [
      { title: 'This term', color: 'periwinkle', cards: [{ list: 'Classes', items: ['Biology, Tuesday and Thursday', 'History, Monday and Wednesday', 'Statistics, Friday'] }, { note: 'Big dates: midterms in week 6.' }] },
      { title: 'This week', color: 'butter', cards: [{ list: 'Reading', items: ['Biology chapter 4', 'History essay outline'] }, { list: 'Practice', items: ['Statistics problem set 2'] }] },
      { title: 'Exam prep', color: 'coral', cards: [{ list: 'Topics to review', items: ['Cell structure', 'Causes of World War I', 'Mean, median and mode'] }, { note: 'Study in 25-minute blocks. The Timer at the bottom helps.' }] },
      { title: 'Done', color: 'mint', cards: [{ list: 'Finished', items: [done('Buy the textbooks'), done('Set up a study spot')] }] },
    ],
  },
];

/** A template by id, the example included. */
export const findTemplate = (id: string): Template | undefined => [...TEMPLATES, EXAMPLE].find((t) => t.id === id);

const itemOf = (i: Item): TodoItem => {
  const base = createItem();
  if (typeof i === 'string') return { ...base, text: i };
  return { ...base, text: i.text, done: i.done === true, children: (i.sub ?? []).map(itemOf) };
};

/** The board a template makes, with new ids: containers side by side (like the tour's first board), named after the template. */
export function templateBoard(t: Template): Board {
  let board: Board = { ...createBoard(), name: t.name };
  t.containers.forEach((c, i) => {
    const col = { ...createColumn(newId('c')), title: c.title, color: c.color, x: i * (COLUMN_W + 24), y: 0 };
    const cards = c.cards.map((b) => {
      if ('note' in b) return { ...(createCard('note') as NoteCard), text: b.note };
      return { ...(createCard('todo') as TodoCard), title: b.list, items: b.items.map(itemOf) };
    });
    board = {
      ...board,
      cards: { ...board.cards, ...Object.fromEntries(cards.map((k) => [k.id, k])) },
      columns: { ...board.columns, [col.id]: { ...col, cardIds: cards.map((k) => k.id) } },
      order: [...board.order, col.id],
    };
  });
  return board;
}

/** Nothing drawn: no card or container (a Completed record is kept but never drawn). */
export const isBlank = (board: Board): boolean => board.order.every((id) => board.cards[id]?.kind === 'completed');

// ---------- the small drawing on a tile ----------

/** The drawing's shape (width : height); a tile's picture is this box. */
export const PREVIEW_ASPECT = '200 / 84';
const BOX_W = 200;
const BOX_H = 84;

export interface TemplatePreview {
  /** Each container, as shares (0 to 100) of the box; its cards as shares of the container. */
  columns: { color: ColorKey | null; left: number; top: number; width: number; height: number; cards: { top: number; height: number }[] }[];
}

// Rough heights of what a container holds, in board pixels: enough to draw a believable picture.
const NOTE_H = 92;
const LIST_H = (items: TodoItem[]): number => 56 + 28 * items.reduce((n, i) => n + 1 + countSub(i), 0);
const countSub = (i: TodoItem): number => i.children.reduce((n, c) => n + 1 + countSub(c), 0);
const HEAD = 34;
const GAP = 10;

/** A tile's picture, worked out from the board itself (so it follows the template and never goes out of date). */
export function templatePreview(board: Board): TemplatePreview {
  const cols = board.order.filter((id) => board.columns[id]).map((id) => board.columns[id]);
  const heights = cols.map((c) => c.cardIds.map((id) => { const k = board.cards[id]; return k?.kind === 'todo' ? LIST_H(k.items) : NOTE_H; }));
  const colH = heights.map((hs) => HEAD + hs.reduce((n, h) => n + h + GAP, 0));
  const width = Math.max(...cols.map((c) => c.x + c.w));
  const height = Math.max(...colH);
  // Fit the whole board in the box, centered across, up to a small margin at the top.
  const s = Math.min((BOX_W - 10) / width, (BOX_H - 10) / height);
  const left = (BOX_W - width * s) / 2;
  const top = 5;
  return {
    columns: cols.map((c, i) => {
      let y = HEAD;
      return {
        color: c.color,
        left: ((left + c.x * s) / BOX_W) * 100,
        top: (top / BOX_H) * 100,
        width: ((c.w * s) / BOX_W) * 100,
        height: ((colH[i] * s) / BOX_H) * 100,
        cards: heights[i].map((h) => {
          const at = { top: (y / colH[i]) * 100, height: (h / colH[i]) * 100 };
          y += h + GAP;
          return at;
        }),
      };
    }),
  };
}
