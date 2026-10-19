import { hrefOf } from './cards';

// Pictures, videos and web addresses put on the board (owner request, job 124; the owner chose that
// nothing is uploaded). A link card shows media from its address when it is drawn, so nothing extra
// is saved. Only http(s) addresses are ever used as a source.

export type Media = { kind: 'image' | 'video' | 'youtube' | 'vimeo'; src: string };

/** The web address in pasted or dragged `text` when the text is nothing but one http(s) address (as written, trimmed), else null. */
export function webAddress(text: string): string | null {
  const t = text.trim();
  if (!/^https?:\/\/[^\s]+$/i.test(t)) return null;
  try {
    return new URL(t).hostname ? t : null;
  } catch {
    return null;
  }
}

/**
 * The address in a drop or a paste: the first usable line of its address list (`text/uri-list`, which
 * is what a dragged link or picture carries), else its plain text. `get` reads one type from the transfer.
 */
export function addressFromTransfer(get: (type: string) => string): string | null {
  for (const line of get('text/uri-list').split(/\r?\n/)) {
    if (line.startsWith('#')) continue;
    const found = webAddress(line);
    if (found) return found;
  }
  return webAddress(get('text/plain'));
}

const IMAGE = /\.(?:jpe?g|png|gif|webp|avif|svg)$/i;
const VIDEO = /\.(?:mp4|webm)$/i;
const VIDEO_ID = /^[\w-]{11}$/;

/** What a link card with this address shows besides the link: a picture, a video or an embedded player, or null for an ordinary link card. */
export function mediaOf(url: string): Media | null {
  // Any other kind of address (javascript:, data:, file:, blob:) is never media. Bare addresses count as https, as the Open link does.
  // (A bare address with a port, like example.com:8443/a.png, is not a scheme.)
  if (/^[a-z][a-z0-9+.-]*:(?!\d+(?:[/?#]|$))/i.test(url.trim()) && !/^https?:\/\//i.test(url.trim())) return null;
  const href = hrefOf(url);
  if (!href) return null;
  const u = new URL(href);
  const host = u.hostname.replace(/^www\./, '');
  const parts = u.pathname.split('/').filter(Boolean);
  const embed = (kind: 'youtube' | 'vimeo', src: string): Media => ({ kind, src });
  if (host === 'youtu.be' && VIDEO_ID.test(parts[0] ?? '')) return embed('youtube', `https://www.youtube-nocookie.com/embed/${parts[0]}`);
  if (host === 'youtube.com' || host === 'm.youtube.com') {
    const id = parts[0] === 'watch' ? (u.searchParams.get('v') ?? '') : parts[0] === 'shorts' ? (parts[1] ?? '') : '';
    if (VIDEO_ID.test(id)) return embed('youtube', `https://www.youtube-nocookie.com/embed/${id}`);
  }
  if (host === 'vimeo.com' && /^\d+$/.test(parts[0] ?? '')) return embed('vimeo', `https://player.vimeo.com/video/${parts[0]}`);
  if (IMAGE.test(u.pathname)) return { kind: 'image', src: u.href };
  if (VIDEO.test(u.pathname)) return { kind: 'video', src: u.href };
  return null;
}
