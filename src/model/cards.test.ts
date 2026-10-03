import { describe, expect, it } from 'vitest';
import { collapsedPreview, createCard, domainOf, hrefOf, isPermanent } from './cards';
import type { LinkCard, NoteCard, TodoCard, TodoItem } from './types';

const item = (done: boolean, children: TodoItem[] = []): TodoItem => ({ id: Math.random().toString(), text: 'x', done, children });

describe('links', () => {
  it('adds https:// to bare addresses', () => {
    expect(hrefOf('milanote.com')).toBe('https://milanote.com/');
    expect(hrefOf('  http://a.org/x ')).toBe('http://a.org/x');
  });

  it('never opens anything but web links', () => {
    expect(hrefOf('')).toBeNull();
    expect(hrefOf('javascript:alert(1)') ?? 'https://').toMatch(/^https?:/);
    expect(hrefOf('https://')).toBeNull();
  });

  it('shows the domain without www', () => {
    expect(domainOf('https://www.example.com/page')).toBe('example.com');
    expect(domainOf('')).toBeNull();
  });
});


describe('collapsed preview', () => {
  it('shows the first line of a note', () => {
    expect(collapsedPreview({ ...(createCard('note') as NoteCard), text: 'First line\nsecond' })).toBe('First line');
  });

  it('shows a list title, without a done count (owner request)', () => {
    const t = { ...(createCard('todo') as TodoCard), title: 'Groceries', items: [item(true), item(false)] };
    expect(collapsedPreview(t)).toBe('Groceries');
    expect(collapsedPreview({ ...t, title: '' })).toBe('List');
  });

  it('shows a link title, or its domain when untitled', () => {
    const l = createCard('link') as LinkCard;
    expect(collapsedPreview({ ...l, title: 'Docs', url: 'a.com' })).toBe('Docs');
    expect(collapsedPreview({ ...l, title: '', url: 'www.a.com' })).toBe('a.com');
  });
});

describe('cards that can never be deleted or copied', () => {
  it('is only the Completed card', () => {
    expect(isPermanent({ ...createCard('note', 'n') })).toBe(false);
    expect(isPermanent({ ...createCard('todo', 't') })).toBe(false);
    expect(isPermanent({ ...createCard('note', 'c'), kind: 'completed', groups: [] } as never)).toBe(true);
  });
});
