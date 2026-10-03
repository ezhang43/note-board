// Makes the app icon PNGs in public/ from public/icon.svg. Run once after changing the icon:
//   node scripts/make-icons.mjs
import { readFileSync } from 'node:fs';
import { chromium } from '@playwright/test';

const svg = readFileSync(new URL('../public/icon.svg', import.meta.url), 'utf8');
// "Maskable" icon: Windows and Android may crop it to a circle or squircle, so the
// background fills the whole square and the ant shrinks into the safe middle area.
const maskable = svg
  .replace('rx="112"', 'rx="0"')
  .replace('<g id="art" ', '<g id="art" transform="translate(51.2 51.2) scale(0.8)" ');

const browser = await chromium.launch();
const page = await browser.newPage();
for (const [file, source, size] of [
  ['icon-192.png', svg, 192],
  ['icon-512.png', svg, 512],
  ['icon-maskable-512.png', maskable, 512],
]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}svg{display:block;width:${size}px;height:${size}px}</style>${source}`,
  );
  await page.screenshot({ path: `public/${file}`, omitBackground: true });
}
await browser.close();
