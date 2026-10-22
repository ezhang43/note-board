import { describe, expect, it } from 'vitest';
import { isStaleCodeError, UPDATED_NOTICE } from './updated';

// Interface review 181 C-L7: after the site is updated, a tab opened before it asks for code files
// that are gone. That is said as "updated, reload", not as a broken picture or a broken PDF.

describe('a code file that failed to download', () => {
  it('is recognized in Chrome, Firefox and Safari wording', () => {
    expect(isStaleCodeError(new TypeError('Failed to fetch dynamically imported module: https://x/assets/html-to-image-1a2b.js'))).toBe(true);
    expect(isStaleCodeError(new TypeError('error loading dynamically imported module: https://x/assets/a.js'))).toBe(true);
    expect(isStaleCodeError(new TypeError('Importing a module script failed.'))).toBe(true);
  });

  it('is not confused with a picture or PDF that could not be made or read', () => {
    expect(isStaleCodeError(new Error('The picture could not be made.'))).toBe(false);
    expect(isStaleCodeError(new Error('Invalid PDF structure.'))).toBe(false);
    expect(isStaleCodeError('nope')).toBe(false);
    expect(isStaleCodeError(null)).toBe(false);
  });

  it('is told in the owner’s words', () => {
    expect(UPDATED_NOTICE).toBe('BusyAnts was updated. Reload the page to use this.');
  });
});
