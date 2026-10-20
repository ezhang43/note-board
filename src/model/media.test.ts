import { describe, expect, it } from 'vitest';
import { addressFromTransfer, mediaOf, webAddress } from './media';

// Pictures, videos and web addresses dropped or pasted onto the board (owner request, job 124).

describe('webAddress: only an http(s) address, alone, counts', () => {
  it('accepts an address, trimmed, as written', () => {
    expect(webAddress('  https://example.com/a?b=1  \n')).toBe('https://example.com/a?b=1');
    expect(webAddress('HTTP://example.com')).toBe('HTTP://example.com');
  });
  it('refuses other kinds of address and anything with more than an address in it', () => {
    for (const bad of ['javascript:alert(1)', 'data:text/html,hi', 'file:///etc/passwd', 'ftp://example.com', 'example.com', 'www.example.com', '', '   ', 'see https://example.com', 'https://a.com https://b.com', 'https://', 'blob:https://example.com/x']) {
      expect(webAddress(bad), bad).toBeNull();
    }
  });
});

describe('addressFromTransfer: the address in a drop or a paste', () => {
  const of = (types: Record<string, string>) => addressFromTransfer((t) => types[t] ?? '');
  it('prefers the address list, skipping comment lines', () => {
    expect(of({ 'text/uri-list': '# from a page\nhttps://example.com/pic.png\nhttps://other.com', 'text/plain': 'https://ignored.com' })).toBe('https://example.com/pic.png');
  });
  it('falls back to plain text', () => {
    expect(of({ 'text/plain': ' https://example.com/x ' })).toBe('https://example.com/x');
  });
  it('is null when neither holds an http(s) address', () => {
    expect(of({ 'text/uri-list': 'javascript:alert(1)', 'text/plain': 'hello' })).toBeNull();
    expect(of({})).toBeNull();
  });
  it('skips an unusable address in the list for a usable one later', () => {
    expect(of({ 'text/uri-list': 'data:image/png;base64,AAAA\nhttps://example.com/a.png' })).toBe('https://example.com/a.png');
  });
});

describe('mediaOf: what a link card shows, decided from its address', () => {
  it('shows pictures, ignoring the query string and capitals', () => {
    for (const u of ['https://x.com/a.jpg', 'https://x.com/a.JPEG', 'https://x.com/a.png?w=100#top', 'https://x.com/a.gif', 'https://x.com/a.webp', 'https://x.com/a.avif', 'https://x.com/a.svg']) {
      expect(mediaOf(u), u).toEqual({ kind: 'image', src: new URL(u).href });
    }
  });
  it('plays mp4 and webm in a video', () => {
    expect(mediaOf('https://x.com/clip.mp4?x=1')).toEqual({ kind: 'video', src: 'https://x.com/clip.mp4?x=1' });
    expect(mediaOf('https://x.com/clip.webm')).toEqual({ kind: 'video', src: 'https://x.com/clip.webm' });
  });
  it('embeds YouTube through the no-cookie player', () => {
    const embed = { kind: 'youtube', src: 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ' };
    expect(mediaOf('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=5s')).toEqual(embed);
    expect(mediaOf('https://youtube.com/watch?v=dQw4w9WgXcQ')).toEqual(embed);
    expect(mediaOf('https://m.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual(embed);
    expect(mediaOf('https://youtu.be/dQw4w9WgXcQ?si=abc')).toEqual(embed);
    expect(mediaOf('https://www.youtube.com/shorts/dQw4w9WgXcQ')).toEqual(embed);
  });
  it('embeds Vimeo', () => {
    expect(mediaOf('https://vimeo.com/76979871')).toEqual({ kind: 'vimeo', src: 'https://player.vimeo.com/video/76979871' });
  });
  it('leaves everything else as a plain link card', () => {
    for (const u of ['https://example.com', 'https://example.com/pic.png.html', 'https://www.youtube.com/', 'https://www.youtube.com/watch?v=', 'https://www.youtube.com/watch?v=a<script>', 'https://youtube.com.evil.com/watch?v=dQw4w9WgXcQ', 'https://notyoutube.com/watch?v=dQw4w9WgXcQ', 'https://vimeo.com/channels/staffpicks', 'https://evilvimeo.com/123', '', 'not a link']) {
      expect(mediaOf(u), u).toBeNull();
    }
  });
  it('never uses an address that is not http(s) as a source', () => {
    for (const u of ['javascript:alert(1)//.png', 'data:image/png;base64,AAAA', 'data:video/mp4;base64,AAAA', 'file:///a.png', 'blob:https://x.com/a.png', 'JaVaScRiPt:alert(1)//a.jpg']) {
      expect(mediaOf(u), u).toBeNull();
    }
  });
  it('treats a bare address as https, as the Open link does', () => {
    expect(mediaOf('example.com/a.png')).toEqual({ kind: 'image', src: 'https://example.com/a.png' });
    expect(mediaOf('images.example.com:8443/a.png')).toEqual({ kind: 'image', src: 'https://images.example.com:8443/a.png' });
  });
});
