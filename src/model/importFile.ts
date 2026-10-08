import { newId, type MakeId } from './cards';
import { readJson } from './importJson';
import { NO_TEXT, pdfToMarkdown, type PdfText } from './importPdf';
import { escapeMarkdown, parseMilanote } from './milanote';
import type { Card, TodoItem } from './types';

// File → Import file… (owner, 2026-10-06): one importer for files from other apps. It works out
// the kind of file from its name and content, then reads it into cards. Markdown (Milanote,
// Obsidian, Notion, Bear…) and text go through the Markdown reader; HTML (Evernote, Google Keep,
// saved web pages) is turned into Markdown first; JSON (Trello, Google Keep) is read by `importJson`;
// a PDF's text (read by pdf.js in the browser) is turned into Markdown by `importPdf`.

/** Files bigger than this are refused. */
export const IMPORT_MAX_BYTES = 5 * 1024 * 1024;
/** At most this many cards come in from one file… */
export const IMPORT_MAX_CARDS = 300;
/** …and at most this many checklist items in all. */
export const IMPORT_MAX_ITEMS = 2000;

export const CANT_READ = 'BusyAnts can’t read that file yet.';
export const TOO_BIG = 'That file is too big to import (the limit is 5 MB).';
export const TOO_LONG = 'That file is very long, so only its first part was added.';
export const UNKNOWN_JSON = 'BusyAnts can only import JSON files from Trello or Google Keep.';

/** What the file picker offers. */
export const IMPORT_ACCEPT = '.md,.markdown,.txt,.html,.htm,.json,.pdf,text/markdown,text/plain,text/html,application/json,application/pdf';

/** A PDF, by its name or its first bytes ("%PDF-"): its text is read with pdf.js before `readImport`. */
export const isPdf = (name: string, start: string) => start.startsWith('%PDF-') || /\.pdf$/i.test(name);

// A heading or a checklist line makes a .txt file Markdown; a dashed line alone doesn't.
const MARKDOWN = /^\s*(#{1,6}(\s|$)|[-*+]\s+\[[ xX]\])/m;

function kindOf(name: string, text: string): 'markdown' | 'text' | 'html' | 'json' | null {
  if (text.includes('\u0000')) return null; // binary (a picture, a PDF…)
  if (/^\s*<(!doctype\s+html|html[\s>])/i.test(text)) return 'html';
  const ext = /\.([a-z]+)$/i.exec(name)?.[1].toLowerCase();
  if (ext === 'html' || ext === 'htm') return 'html';
  if (ext === 'md' || ext === 'markdown') return 'markdown';
  if (ext === 'json') return 'json';
  if (ext === 'txt') return MARKDOWN.test(text) ? 'markdown' : 'text';
  return null;
}

/**
 * Reads a file's text (or a PDF's pages of text) into cards (positions all 0,0), with a short note
 * to show when it can't be read or was cut short. `parseHtml` is the browser's DOMParser (passed in
 * so this stays testable).
 */
export function readImport(
  name: string,
  text: string | PdfText[][],
  parseHtml: (html: string) => Document,
  makeId: MakeId = newId,
): { cards: Card[]; note: string } {
  if (typeof text !== 'string') {
    const cards = parseMilanote(pdfToMarkdown(text), makeId, { splitNotes: true });
    return cards.length ? cap(cards) : { cards: [], note: NO_TEXT }; // a scan, or only a page number
  }
  // simple: counts characters, not bytes; the File menu checks the real size before reading.
  if (text.length > IMPORT_MAX_BYTES) return { cards: [], note: TOO_BIG };
  let cards: Card[];
  switch (kindOf(name, text)) {
    case 'markdown':
      cards = parseMilanote(text.replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, ''), makeId); // front matter skipped
      break;
    case 'text':
      cards = parseMilanote(text, makeId, { splitNotes: true });
      break;
    case 'json': {
      const read = readJson(text, makeId);
      if (!read) return { cards: [], note: UNKNOWN_JSON };
      cards = read;
      break;
    }
    case 'html':
      cards = parseMilanote(htmlToMarkdown(parseHtml(text)), makeId, { splitNotes: true });
      break;
    default:
      return { cards: [], note: CANT_READ };
  }
  return cap(cards);
}

/** Keeps the first IMPORT_MAX_CARDS cards and IMPORT_MAX_ITEMS items, cutting the list that goes over. */
function cap(cards: Card[]): { cards: Card[]; note: string } {
  let budget = IMPORT_MAX_ITEMS;
  let cut = false;
  const trim = (items: TodoItem[]): TodoItem[] =>
    items.flatMap((it) => {
      if (budget <= 0) return (cut = true), [];
      budget--;
      return [{ ...it, children: trim(it.children) }];
    });
  const out: Card[] = [];
  for (const c of cards) {
    if (out.length === IMPORT_MAX_CARDS || (budget <= 0 && c.kind === 'todo')) return { cards: out, note: TOO_LONG };
    out.push(c.kind === 'todo' ? { ...c, items: trim(c.items) } : c);
  }
  return { cards: out, note: cut ? TOO_LONG : '' };
}

const SKIP = new Set(['SCRIPT', 'STYLE', 'NAV', 'HEAD', 'NOSCRIPT', 'TEMPLATE', 'IFRAME', 'SVG']);
const BLOCK = /^(P|DIV|SECTION|ARTICLE|MAIN|HEADER|FOOTER|ASIDE|BLOCKQUOTE|PRE|TABLE|TR|FORM|FIGURE|DL|DT|DD|HR|ADDRESS)$/;

/**
 * An HTML document as Markdown the reader understands: h1–h6 → "## title", ul/ol/li → "- [ ]"
 * items (indented for nesting, "[x]" for a ticked checkbox), each paragraph its own block, a
 * paragraph that is only a link → "[text](address)". Scripts, styles, nav, head and comments are
 * skipped. Only reads the parsed tree: nothing is put on the page, run or loaded.
 */
export function htmlToMarkdown(doc: Document): string {
  const out: string[] = [];
  let para: { text: string; href?: string }[] = [];

  const flush = () => {
    const parts = para;
    para = [];
    const words = parts.filter((p) => p.text.trim());
    if (!words.length) return;
    // Only a link (an <a>, or a bare address): a link card.
    const whole = words.map((p) => p.text).join('').trim();
    const href = words.length === 1 && words[0].href ? words[0].href : (/^<?(https?:\/\/[^\s<>]+?)>?$/.exec(whole)?.[1] ?? '');
    if (/^https?:\/\/[^)\s]+$/.test(href)) out.push(whole.replace(/^<|>$/g, '') === href ? href : `[${escapeMarkdown(whole)}](${href})`);
    else {
      const text = parts
        .map((p) => (p.href && /^https?:/.test(p.href) && p.text.trim() !== p.href ? `${escapeMarkdown(p.text)} \\(${escapeMarkdown(p.href)}\\)` : escapeMarkdown(p.text)))
        .join('')
        .split('\n')
        .map((l) => l.replace(/\s+/g, ' ').trim())
        .join('\n')
        .replace(/\n{2,}/g, '\n') // a blank line would split the note
        .replace(/^\n+|\n+$/g, '');
      if (text) out.push(text);
    }
    out.push('');
  };

  /** Inline text of a node into the paragraph (each link as one part), skipping lists inside it. */
  const inline = (node: Node) => {
    if (node.nodeType === 3) para.push({ text: (node.textContent ?? '').replace(/\s+/g, ' ') });
    if (node.nodeType !== 1) return; // comments and the rest
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag) || tag === 'UL' || tag === 'OL') return;
    if (tag === 'BR') return void para.push({ text: '\n' });
    if (tag === 'A') return void para.push({ text: textOf(el), href: el.getAttribute('href') ?? undefined });
    const gap = BLOCK.test(tag) || tag === 'TD' || tag === 'TH' || tag === 'LI' ? ' ' : ''; // keeps words in cells and blocks apart
    para.push({ text: gap });
    el.childNodes.forEach(inline);
    para.push({ text: gap });
  };
  /** An element's text, on one line. */
  const textOf = (el: Element) => {
    const outer = para;
    para = [];
    el.childNodes.forEach(inline);
    const text = para.map((p) => p.text).join('').replace(/\s+/g, ' ').trim();
    para = outer;
    return text;
  };

  const list = (el: Element, depth: number) => {
    for (const li of Array.from(el.children)) {
      const tag = li.tagName.toUpperCase();
      if (tag === 'UL' || tag === 'OL') list(li, depth + 1); // a list straight inside a list
      if (tag !== 'LI') continue;
      const text = textOf(li);
      const box = Array.from(li.querySelectorAll('input')).find((b) => b.getAttribute('type')?.toLowerCase() === 'checkbox' && b.closest('li') === li);
      out.push(`${'    '.repeat(depth)}- [${box?.hasAttribute('checked') ? 'x' : ' '}] ${escapeMarkdown(text)}`);
      for (const sub of Array.from(li.querySelectorAll('ul, ol'))) if (sub.parentElement?.closest('li') === li) list(sub, depth + 1);
    }
  };

  const block = (node: Node) => {
    if (node.nodeType !== 1) return void inline(node);
    const el = node as Element;
    const tag = el.tagName.toUpperCase();
    if (SKIP.has(tag)) return;
    if (/^H[1-6]$/.test(tag)) {
      flush();
      const title = textOf(el);
      if (title) out.push(`## ${escapeMarkdown(title)}`, ''); // an empty one (a logo) is skipped
    } else if (tag === 'UL' || tag === 'OL') {
      flush();
      list(el, 0);
      out.push('');
    } else if (BLOCK.test(tag) || tag === 'BODY' || tag === 'HTML') {
      flush();
      el.childNodes.forEach(block);
      flush();
    } else inline(el);
  };

  block(doc.body ?? doc.documentElement);
  flush();
  return out.join('\n');
}
