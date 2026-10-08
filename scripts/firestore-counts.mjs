// @ts-check
// Counts what is in BusyAnts' Firestore, for moving it to the US (job #40, route C of
// docs/plans/firestore-us-move-plan.md). READ ONLY: it only counts and reads, never writes.
// The owner runs it in Google Cloud Shell, where `gcloud auth print-access-token` gives the
// owner's own sign-in. Plain Node, nothing to install.
//
//   node firestore-counts.mjs '(default)' | tee before.txt
//   node firestore-counts.mjs us-check | tee after.txt
//   node firestore-counts.mjs --compare before.txt after.txt
//
// The access token is only ever put in the request header: never printed or saved.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const PROJECT = 'note-board-a672a';

/** What the plan's section 3 lists. `shared` is both a top-level collection and a sub-collection of boards/{uid}, so boards/*\/shared is all `shared` minus the top-level ones. */
export const COUNTS = [
  { name: 'boards', collection: 'boards', group: false },
  { name: 'versions', collection: 'versions', group: true },
  { name: 'versionData', collection: 'versionData', group: true },
  { name: 'boards/*/shared', collection: 'shared', group: true },
  { name: 'shared', collection: 'shared', group: false },
  { name: 'members', collection: 'members', group: true },
];

/** The top-level collections whose documents get a content fingerprint. */
const FINGERPRINTED = ['boards', 'shared'];

/** @param {string} database */
export function docsUrl(database) {
  if (database !== '(default)' && !/^[a-z][a-z0-9-]{2,61}[a-z0-9]$/.test(database)) throw new Error(`"${database}" is not a database id (use '(default)' or a name like us-check).`);
  return `https://firestore.googleapis.com/v1/projects/${PROJECT}/databases/${database}/documents`;
}

/** @param {string} collectionId @param {boolean} allDescendants */
export function countRequest(collectionId, allDescendants) {
  return {
    structuredAggregationQuery: {
      structuredQuery: { from: [{ collectionId, allDescendants }] },
      aggregations: [{ alias: 'n', count: {} }],
    },
  };
}

/** @param {unknown} answer the JSON from runAggregationQuery */
export function readCount(answer) {
  const n = Array.isArray(answer) ? answer.find((r) => r?.result)?.result?.aggregateFields?.n?.integerValue : undefined;
  if (typeof n !== 'string' || !/^\d+$/.test(n)) throw new Error('Firestore sent back no count.');
  return Number(n);
}

/** JSON with every object's keys sorted, so field order never changes the hash. @param {unknown} v @returns {string} */
function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object')
    return `{${Object.keys(v)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${canonical(/** @type {Record<string, unknown>} */ (v)[k])}`)
      .join(',')}}`;
  return JSON.stringify(v);
}

/**
 * A document's path, the length of its board text (`data`, -1 if none) and a hash of all its
 * fields. The update and create times are left out: an import gives them new values.
 * @param {{ name: string, fields?: Record<string, any> }} doc
 */
export function fingerprint(doc) {
  const fields = doc.fields ?? {};
  const data = fields.data?.stringValue;
  return {
    path: doc.name.slice(doc.name.indexOf('/documents/') + '/documents/'.length),
    dataLength: typeof data === 'string' ? data.length : -1,
    hash: createHash('sha256').update(canonical(fields)).digest('hex').slice(0, 16),
  };
}

/** @typedef {{ path: string, dataLength: number, hash: string }} Fingerprint */
/** @typedef {{ counts: Record<string, number>, docs: Fingerprint[] }} Report */

/** @param {Report & { database: string }} report */
export function formatReport({ database, counts, docs }) {
  return [
    `# Firestore counts, project ${PROJECT}, database ${database}`,
    ...Object.entries(counts).map(([name, n]) => `count ${name} ${n}`),
    '# doc <path> <board text length, -1 = none> <contents hash>',
    ...docs.map((d) => `doc ${d.path} ${d.dataLength} ${d.hash}`),
    '',
  ].join('\n');
}

/** @param {string} text @returns {Report} */
export function parseReport(text) {
  /** @type {Report} */
  const report = { counts: {}, docs: [] };
  for (const line of text.split(/\r?\n/)) {
    const count = /^count (\S+) (\d+)$/.exec(line);
    const doc = /^doc (.+) (-?\d+) ([0-9a-f]{16})$/.exec(line);
    if (count) report.counts[count[1]] = Number(count[2]);
    else if (doc) report.docs.push({ path: doc[1], dataLength: Number(doc[2]), hash: doc[3] });
  }
  if (!Object.keys(report.counts).length) throw new Error('That file is not output of the count script.');
  return report;
}

/** Plain-words comparison of two saved outputs. @param {string} beforeText @param {string} afterText */
export function compareReports(beforeText, afterText) {
  const before = parseReport(beforeText);
  const after = parseReport(afterText);
  const out = [];
  for (const name of new Set([...Object.keys(before.counts), ...Object.keys(after.counts)]))
    if (before.counts[name] !== after.counts[name]) out.push(`${name}: ${before.counts[name] ?? 'none'} before, ${after.counts[name] ?? 'none'} after`);
  const afterDocs = new Map(after.docs.map((d) => [d.path, d]));
  const beforePaths = new Set(before.docs.map((d) => d.path));
  for (const d of before.docs) {
    const a = afterDocs.get(d.path);
    if (!a) out.push(`${d.path}: missing after`);
    else if (a.hash !== d.hash || a.dataLength !== d.dataLength) out.push(`${d.path}: contents changed`);
  }
  for (const d of after.docs) if (!beforePaths.has(d.path)) out.push(`${d.path}: new after (not there before)`);
  return out.length ? [`DIFFERENT: ${out.length} difference${out.length === 1 ? '' : 's'}. Stop and tell the crew.`, ...out] : ['MATCH: every count and every board is the same.'];
}

// ---- The network part: thin on purpose. ----

/** @param {string} database */
async function readDatabase(database) {
  const base = docsUrl(database);
  // simple: the token is fetched once; it lasts an hour, far longer than a run.
  const token = execFileSync('gcloud', ['auth', 'print-access-token'], { encoding: 'utf8' }).trim();
  const headers = { authorization: `Bearer ${token}`, 'x-goog-user-project': PROJECT, 'content-type': 'application/json' };
  /** @param {string} url @param {object} [body] */
  async function call(url, body) {
    const res = await fetch(url, body ? { method: 'POST', headers, body: JSON.stringify(body) } : { headers });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`Firestore answered ${res.status}: ${json?.error?.message ?? res.statusText}`);
    return json;
  }

  /** @type {Record<string, number>} */
  const counts = {};
  for (const c of COUNTS) counts[c.name] = readCount(await call(`${base}:runAggregationQuery`, countRequest(c.collection, c.group)));
  counts['boards/*/shared'] -= counts.shared;

  const docs = [];
  for (const collection of FINGERPRINTED) {
    let page = '';
    do {
      const json = await call(`${base}/${collection}?pageSize=300${page ? `&pageToken=${encodeURIComponent(page)}` : ''}`);
      for (const d of json.documents ?? []) docs.push(fingerprint(d));
      page = json.nextPageToken ?? '';
    } while (page);
  }
  return formatReport({ database, counts, docs });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [first, a, b] = process.argv.slice(2);
  try {
    if (first === '--compare' && a && b) {
      const lines = compareReports(readFileSync(a, 'utf8'), readFileSync(b, 'utf8'));
      console.log(lines.join('\n'));
      process.exitCode = lines[0].startsWith('MATCH') ? 0 : 1;
    } else if (first && !first.startsWith('-')) {
      process.stdout.write(await readDatabase(first));
    } else {
      console.log("Use: node firestore-counts.mjs '(default)'   or   node firestore-counts.mjs --compare before.txt after.txt");
      process.exitCode = 2;
    }
  } catch (e) {
    console.error(`Stopped: ${e instanceof Error ? e.message : e}`);
    process.exitCode = 1;
  }
}
