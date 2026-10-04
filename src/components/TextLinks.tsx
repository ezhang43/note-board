import type { MouseEvent } from 'react';
import { linkAt, linksIn } from '../model/links';
import { ExternalIcon } from './icons';

// Clickable links in text (owner request, 2026-10-05). A text box can't hold real links, so a
// note lists the web addresses in it as links underneath (like Google Keep), and Ctrl+click on an
// address in a note or checklist item opens it.

/** Ctrl+click (⌘+click on a Mac) on a web address in a text box opens it in a new tab. */
export function openLinkOnCtrlClick(e: MouseEvent<HTMLTextAreaElement>) {
  if (!(e.ctrlKey || e.metaKey)) return;
  const field = e.currentTarget;
  const href = linkAt(field.value, field.selectionStart);
  if (!href) return;
  e.preventDefault();
  window.open(href, '_blank', 'noopener,noreferrer');
}

/** "https://www.example.com/article/" → "example.com/article". */
const shown = (href: string) => href.replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/$/, '');

/** The web addresses in a note, as links under its text. */
export function NoteLinks({ text }: { text: string }) {
  const links = linksIn(text);
  if (!links.length) return null;
  return (
    <div className="note-links">
      {links.map((l) => (
        <a key={l.href} className="note-link" href={l.href} target="_blank" rel="noopener noreferrer" title={l.href}>
          <ExternalIcon />
          <span>{shown(l.href)}</span>
        </a>
      ))}
    </div>
  );
}
