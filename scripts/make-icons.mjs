// Makes the app icon PNGs in public/ from public/busyants-icon.svg. Run once after changing the icon:
//   node scripts/make-icons.mjs
// The files carry the app's name (they were icon-*.png before the ant): a new file name is what
// makes installed apps, home screens and browser tabs fetch the picture again instead of keeping
// an old one. If the icon changes again, give the files new names (and update index.html,
// manifest.webmanifest, the toolbar logo and the offline copy's version in sw.js).
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('../public/busyants-icon.svg', import.meta.url), 'utf8');
// "Maskable" icon: Windows and Android may crop it to a circle or squircle, so the
// background fills the whole square and the ant shrinks into the safe middle area.
const maskable = svg
  .replace('rx="112"', 'rx="0"')
  .replace('<g id="art" ', '<g id="art" transform="translate(51.2 51.2) scale(0.8)" ');
// iPhone / iPad home screen: a square picture (the system rounds the corners itself; see-through
// corners would show black).
const square = svg.replace('rx="112"', 'rx="0"');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, source, size] of [
  ['busyants-192.png', svg, 192],
  ['busyants-512.png', svg, 512],
  ['busyants-maskable-512.png', maskable, 512],
  ['busyants-apple-180.png', square, 180],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`,
  );
  await page.screenshot({ path: `public/${file}`, omitBackground: true });
}
await browser.close();
