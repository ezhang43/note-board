import { describe, expect, it } from 'vitest';
import { goatcounter, goatcounterLoader } from './goatcounter';

// Job 117 (owner request, 2026-10-19): page visits are counted with GoatCounter on the published site only.

// Run the loader the way a browser would, with a pretend address and page; returns the script it added, if any.
function run(hostname: string, pathname = '/note-board/', search = '') {
  const added: Record<string, unknown>[] = [];
  const script: Record<string, unknown> = { dataset: {} };
  const document = { createElement: () => script, head: { appendChild: (s: Record<string, unknown>) => added.push(s) } };
  new Function('location', 'document', goatcounterLoader)({ hostname, pathname, search }, document);
  return added[0];
}

describe('GoatCounter loader', () => {
  it("adds the counter on the published site, with the owner's site code and no extras", () => {
    const s = run('ezhang43.github.io');
    expect(s.src).toBe('https://gc.zgo.at/count.js');
    expect((s.dataset as Record<string, string>).goatcounter).toBe('https://busyants.goatcounter.com/count');
    expect(s.async).toBe(true);
  });

  it("counts the page path only, never the query: a share link's ?join= key stays in the browser", () => {
    const s = run('ezhang43.github.io', '/note-board/', '?join=s_ab12cd34.k3y9secret');
    expect(JSON.parse((s.dataset as Record<string, string>).goatcounterSettings)).toEqual({ path: '/note-board/' });
    expect(JSON.stringify(s)).not.toContain('secret');
  });

  it("adds nothing for another project's pages on the same github.io address", () => {
    expect(run('ezhang43.github.io', '/other-site/')).toBeUndefined();
  });

  it('adds nothing on localhost, a local address or any other site', () => {
    for (const h of ['localhost', '127.0.0.1', '192.168.1.5', 'example.com', 'ezhang43.github.io.evil.com']) expect(run(h), h).toBeUndefined();
  });
});

describe('GoatCounter build step', () => {
  const page = '<html><head><title>x</title></head><body></body></html>';
  const plugin = goatcounter();

  it('only runs in a build, never in npm run dev', () => {
    expect(plugin.apply).toBe('build');
  });

  it('puts the loader in the head of a page, once', () => {
    const out = (plugin.transformIndexHtml as (h: string) => string)(page);
    expect(out).toContain(goatcounterLoader);
    expect(out.indexOf('<script>')).toBeLessThan(out.indexOf('</head>'));
    expect(out.split('gc.zgo.at').length - 1).toBe(1);
  });
});
