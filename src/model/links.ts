import { hrefOf } from './cards';

// Clickable links in text (owner request, 2026-10-05): web addresses typed into a note or a
// checklist item, shown as links under a note and opened by Ctrl+click.

export interface FoundLink {
  /** The address as written. */
  text: string;
  /** What it opens (https:// added to www. addresses). */
  href: string;
  start: number;
  end: number;
}

const ADDRESS = /\b(?:https?:\/\/|www\.)[^\s<>"]+/gi;

/** Trailing punctuation isn't part of the address, nor a closing bracket without an opening one. */
function trim(raw: string): string {
  let s = raw.replace(/[.,;:!?'’”]+$/, '');
  while (s.endsWith(')') && (s.match(/\(/g)?.length ?? 0) < (s.match(/\)/g)?.length ?? 0)) s = s.slice(0, -1).replace(/[.,;:!?'’”]+$/, '');
  return s;
}

/** Every web address in `text`, in order, each address once. */
export function linksIn(text: string): FoundLink[] {
  const found: FoundLink[] = [];
  for (const m of text.matchAll(ADDRESS)) {
    const t = trim(m[0]);
    const href = hrefOf(t);
    if (!href || found.some((f) => f.href === href)) continue;
    found.push({ text: t, href, start: m.index!, end: m.index! + t.length });
  }
  return found;
}

/** The address that the spot `at` in `text` falls in (for Ctrl+click), or null. */
export function linkAt(text: string, at: number): string | null {
  for (const m of text.matchAll(ADDRESS)) {
    const t = trim(m[0]);
    if (at >= m.index! && at <= m.index! + t.length) return hrefOf(t);
  }
  return null;
}
