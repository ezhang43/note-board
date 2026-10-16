import { describe, expect, it } from 'vitest';
import { FEEDBACK_MAX, feedbackText } from './feedback';

// Send feedback (owner request, job #69): a short note of 1 to 1,000 characters, trimmed.

describe('feedback text', () => {
  it('is trimmed of spaces and blank lines around it', () => {
    expect(feedbackText('  \n Love the checklists! \n\n')).toBe('Love the checklists!');
  });

  it('keeps line breaks inside the note', () => {
    expect(feedbackText('One\n\nTwo')).toBe('One\n\nTwo');
  });

  it('is nothing to send when empty or only spaces', () => {
    expect(feedbackText('')).toBeNull();
    expect(feedbackText(' \n\t ')).toBeNull();
  });

  it('allows up to 1,000 characters, and not one more', () => {
    expect(FEEDBACK_MAX).toBe(1000);
    expect(feedbackText('a'.repeat(1000))).toBe('a'.repeat(1000));
    expect(feedbackText('a'.repeat(1001))).toBeNull();
    // Spaces around it don't count.
    expect(feedbackText(`  ${'a'.repeat(1000)}  `)).toBe('a'.repeat(1000));
  });
});
