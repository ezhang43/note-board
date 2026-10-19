// npm run mcp:pack: the connector as one file for Claude Desktop, mcp/dist/busyants.mcpb (an MCP
// Bundle: manifest.json, the built server and the icon, zipped). This puts the files together in
// mcp/dist/bundle; the npm script then zips them with the mcpb tool, which checks the manifest
// against the bundle format as it packs.
import { copyFileSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';

const at = (path) => new URL(`../${path}`, import.meta.url);
const bundle = 'mcp/dist/bundle/';

rmSync(at(bundle), { recursive: true, force: true });
mkdirSync(at(`${bundle}server`), { recursive: true });
copyFileSync(at('mcp/manifest.json'), at(`${bundle}manifest.json`));
copyFileSync(at('public/busyants-512.png'), at(`${bundle}icon.png`));
copyFileSync(at('mcp/dist/server.js'), at(`${bundle}server/server.js`));
// The built server is an ES module; without this, Node would read it as CommonJS.
writeFileSync(at(`${bundle}server/package.json`), '{ "type": "module" }\n');
