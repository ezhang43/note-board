import { describe, expect, it } from 'vitest';
import { CATEGORIES, OTHER_CATEGORY, categoryName, categoryOf, categoryIndex, type CategoryId } from './categorize';

// The Visualizer's categories (owner request, 2026-11-12): built-in word rules behind one function,
// categoryOf(item, listTitle), so a later AI categorizer can stand in for it.

const of = (text: string, list = 'List'): CategoryId => categoryOf({ text }, list);

describe('categories', () => {
  it('has the eight named categories and Other last, each with a stable id and a display name', () => {
    expect(CATEGORIES.map((c) => c.name)).toEqual([
      'Errands & shopping',
      'Work',
      'Calls & messages',
      'Home & chores',
      'Health & fitness',
      'Money & admin',
      'Learning',
      'Social & family',
      'Other',
    ]);
    expect(CATEGORIES[CATEGORIES.length - 1].id).toBe(OTHER_CATEGORY);
    expect(new Set(CATEGORIES.map((c) => c.id)).size).toBe(CATEGORIES.length);
    expect(categoryName('errands')).toBe('Errands & shopping');
    expect(categoryIndex('work')).toBe(1);
  });

  it('sends an id nobody knows to Other', () => {
    expect(categoryName('nope')).toBe('Other');
    expect(categoryIndex('nope')).toBe(CATEGORIES.length - 1);
  });
});

describe('categoryOf: the item text', () => {
  it.each<[string, CategoryId]>([
    ['Buy milk', 'errands'],
    ['pick up the dry cleaning', 'errands'],
    ['Drop off the parcel', 'errands'],
    ['Return the boots to the store', 'errands'],
    ['Weekly groceries', 'errands'],
    ['Send the report to the client', 'work'],
    ['Team meeting prep', 'work'],
    ['Call the plumber', 'calls'],
    ['Email Sam about Friday', 'calls'],
    ['Reply to the landlord', 'calls'],
    ['Text back', 'calls'],
    ['Clean the kitchen', 'home'],
    ['Do the laundry', 'home'],
    ['Wash the dishes', 'home'],
    ['Fix the shelf', 'home'],
    ['Gym at 6', 'health'],
    ['Go for a run', 'health'],
    ['Book the dentist', 'health'],
    ['Take meds', 'health'],
    ['Pay the electric bill', 'money'],
    ['File taxes', 'money'],
    ['Renew passport', 'money'],
    ['Fill in the form', 'money'],
    ['Read chapter 3', 'learning'],
    ['Study for the exam', 'learning'],
    ['Practice piano', 'learning'],
    ['Dinner with friends', 'social'],
    ['Mom birthday present', 'social'],
    ['Visit grandma', 'social'],
  ])('%s is %s', (text, id) => {
    expect(of(text)).toBe(id);
  });

  it('ignores capital letters and punctuation around a word', () => {
    expect(of('BUY MILK')).toBe('errands');
    expect(of('(gym)')).toBe('health');
    expect(of('Laundry, then dishes!')).toBe('home');
  });

  it('matches whole words only: "store" matches, "restore" and "storefront" do not', () => {
    expect(of('Go to the store')).toBe('errands');
    expect(of('Restore the backup')).toBe('other');
    expect(of('Storefront sign')).toBe('other');
    expect(of('Run at dawn')).toBe('health');
    expect(of('Overrun')).toBe('other');
    expect(of('Bill')).toBe('money');
    expect(of('Billboard')).toBe('other');
  });

  it('counts a plain plural as the same word', () => {
    expect(of('Pay bills')).toBe('money');
    expect(of('Two calls to make')).toBe('calls');
    expect(of('Dishes')).toBe('home');
    expect(of('Taxes')).toBe('money');
    expect(of('Stores')).toBe('errands');
  });

  it('matches phrases of several words, with any spacing', () => {
    expect(of('Pick   up parcel')).toBe('errands');
    expect(of('Drop off the keys')).toBe('errands');
    expect(of('Workout at lunch')).toBe('health');
    expect(of('Hang out with Sam')).toBe('social');
  });

  it('when an item fits several categories, the one listed first wins', () => {
    expect(of('Call the bank')).toBe('calls'); // Calls & messages before Money & admin
    expect(of('Order a book')).toBe('errands');
    expect(of('Email the tax form')).toBe('calls');
    expect(of('Pay for the groceries')).toBe('errands');
  });

  it('is Other when no rule fits, or the text is empty', () => {
    expect(of('Something odd')).toBe('other');
    expect(of('')).toBe('other');
    expect(of('   ')).toBe('other');
  });
});

describe('categoryOf: the list title as a fallback', () => {
  it('uses the list title when the item text fits nothing', () => {
    expect(categoryOf({ text: 'Milk' }, 'Groceries')).toBe('errands');
    expect(categoryOf({ text: 'Third floor' }, 'Chores')).toBe('home');
    expect(categoryOf({ text: 'Tuesday' }, 'Gym plan')).toBe('health');
  });

  it('puts the item text first: a matching item beats the list title', () => {
    expect(categoryOf({ text: 'Call mom' }, 'Groceries')).toBe('calls');
    expect(categoryOf({ text: 'Pay rent' }, 'Chores')).toBe('money');
  });

  it('is Other when neither fits; the placeholder title "List" matches nothing', () => {
    expect(categoryOf({ text: 'Sand the table' }, 'Tools')).toBe('other');
    expect(categoryOf({ text: 'Sand the table' }, 'List')).toBe('other');
    expect(categoryOf({ text: 'Sand the table' }, '')).toBe('other');
  });
});
