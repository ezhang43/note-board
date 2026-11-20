import { expect, it } from 'vitest';
import { helperUrl } from './helperUrl';

it('takes an https address (or a local http one) without its trailing slash, and nothing else', () => {
  expect(helperUrl('https://busyants-calendar-helper.someone.workers.dev/')).toBe('https://busyants-calendar-helper.someone.workers.dev');
  expect(helperUrl(' https://h.example ')).toBe('https://h.example');
  // The helper answers at its root only, so an address with a path could never work (code review 2026-11-20).
  expect(() => helperUrl('https://h.example/base')).toThrow();
  expect(helperUrl('http://localhost:8787')).toBe('http://localhost:8787');
  expect(helperUrl(undefined)).toBe('');
  expect(helperUrl('')).toBe('');
  expect(() => helperUrl('http://h.example')).toThrow();
  expect(() => helperUrl('javascript:alert(1)')).toThrow();
  expect(() => helperUrl('https://h.example/?x=1')).toThrow();
  expect(() => helperUrl('not a url')).toThrow();
  expect(() => helperUrl('https://*.workers.dev')).toThrow();
});
