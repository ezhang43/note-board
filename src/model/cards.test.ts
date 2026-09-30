import { describe, expect, it } from 'vitest';
import { collapsedPreview, countItems, createCard, domainOf, hrefOf, progressText } from './cards';
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

describe('to-do counts', () => {
  it('counts nested items too', () => {
    const items = [item(true), item(false, [item(true), item(false)]), item(true)];
    expect(countItems(items)).toEqual({ total: 5, done: 3 });
  });

  it('shows "2/5 done" in the header of a to-do list only', () => {
    const t = { ...(createCard('todo') as TodoCard), items: [item(true), item(true), item(false), item(false), item(false)] };
    expect(progressText(t)).toBe('2/5 done');
    expect(progressText(createCard('note'))).toBe('');
  });
});

describe('collapsed preview', () => {
  it('shows the first line of a note', () => {
    expect(collapsedPreview({ ...(createCard('note') as NoteCard), text: 'First line\nsecond' })).toBe('First line');
  });

  it('shows a list title with its count', () => {
    const t = { ...(createCard('todo') as TodoCard), title: 'Groceries', items: [item(true), item(false)] };
    expect(collapsedPreview(t)).toBe('Groceries · 1/2');
  });

  it('shows a link title, or its domain when untitled', () => {
    const l = createCard('link') as LinkCard;
    expect(collapsedPreview({ ...l, title: 'Docs', url: 'a.com' })).toBe('Docs');
    expect(collapsedPreview({ ...l, title: '', url: 'www.a.com' })).toBe('a.com');
  });
});
