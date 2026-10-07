import { problems } from '../src/model/board';
import { contentHash, needsVersion, summarizeWorkspace } from '../src/model/versions';
import { readWorkspace, serializeWorkspace } from '../src/model/workspace';
import { safeToEdit } from './boards';
import type { Edit } from './edits';
import type { OwnDb } from './firestore';

// Saving one of the connector's changes to the owner's own boards. Never over a save it hasn't
// seen (Firestore's updateTime condition), a safety version first, nothing saved unless every
// board still follows the app's rules, and a check a few seconds later that the app (which saves
// "most recent wins") didn't save over it.

/** firestore.rules refuse a saved board text longer than this. */
export const MAX_SAVE = 900_000;
/** How long after saving the boards are read again, to check the change is still there. */
export const PUT_BACK_MS = 5000;
/** Saves tried again when the boards changed in between, after the first try. */
const RETRIES = 3;

export interface SaveDeps {
  db: OwnDb;
  /** The `client` name saved with the boards, so the app knows the change came from elsewhere. */
  client: string;
  now: () => number;
  wait: (ms: number) => Promise<void>;
  log: (line: string) => void | Promise<void>;
  /** Kept between tool calls: when the connector last changed the boards. */
  memory: { lastEditAt: number | null };
}

export interface SaveResult {
  text: string;
  isError?: boolean;
}

class Stop extends Error {}

/** The boards as saved now, with `edit` made on them; Stop when they can't or mustn't be changed. */
async function readAndEdit(db: OwnDb, edit: Edit) {
  const { raw, updateTime } = await db.read();
  const safe = safeToEdit(raw);
  if (!safe.ok) throw new Stop(`Nothing was changed: ${safe.reason}.`);
  const r = edit(readWorkspace(raw)!.ws);
  if ('error' in r) throw new Stop(r.error);
  if (!r.changed.length) return { raw: raw!, updateTime, data: raw!, changed: r.changed };
  for (const [id, board] of Object.entries(r.ws.boards)) {
    const found = problems(board);
    if (found.length) throw new Stop(`Nothing was changed: the change would break board ${id} (${found.join('; ')}).`);
  }
  const data = serializeWorkspace(r.ws);
  if (data.length > MAX_SAVE) throw new Stop(`Nothing was changed: the boards would be too big to save (${data.length.toLocaleString('en-GB')} characters; the limit is ${MAX_SAVE.toLocaleString('en-GB')}).`);
  return { raw: raw!, updateTime, data, changed: r.changed };
}

/** Saves the boards before the change as a version, when the app's version rule (or a first change) asks for one. */
async function safetyVersion(deps: SaveDeps, raw: string) {
  const now = deps.now();
  const newest = await deps.db.newestVersion();
  const hash = contentHash(raw);
  const due = deps.memory.lastEditAt === null || needsVersion(newest?.savedAt ?? null, deps.memory.lastEditAt, now);
  if (!due || newest?.hash === hash) return;
  await deps.db.addVersion({ id: crypto.randomUUID(), savedAt: now, ...summarizeWorkspace(readWorkspace(raw)!.ws), hash }, raw);
}

/** Makes `edit` and saves it, trying again (up to RETRIES times) when the boards changed in between. */
async function commit(deps: SaveDeps, edit: Edit, before?: (raw: string) => Promise<void>): Promise<string[]> {
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    const got = await readAndEdit(deps.db, edit);
    if (!got.changed.length) return [];
    if (attempt === 0 && before) await before(got.raw);
    if (await deps.db.write(got.data, deps.client, got.updateTime)) return got.changed;
  }
  throw new Stop('Nothing was changed: the boards kept changing while saving (BusyAnts is probably open and busy). Try again in a moment.');
}

/** Whether `edit` is still on the boards (making it again changes nothing). */
async function stillThere(db: OwnDb, edit: Edit): Promise<boolean> {
  const { raw } = await db.read();
  if (!safeToEdit(raw).ok) return false;
  const r = edit(readWorkspace(raw)!.ws);
  return !('error' in r) && r.changed.length === 0;
}

const list = (changed: string[]) => changed.map((c) => `- ${c}`).join('\n');

export async function saveChange(deps: SaveDeps, edit: Edit): Promise<SaveResult> {
  let changed: string[];
  try {
    changed = await commit(deps, edit, async (raw) => {
      try {
        await safetyVersion(deps, raw);
      } catch (e) {
        throw new Stop(`Nothing was changed: the safety version (a copy of the boards as they were) couldn’t be saved. ${e instanceof Error ? e.message : ''}`.trim());
      }
    });
  } catch (e) {
    if (e instanceof Stop) return { text: e.message, isError: true };
    throw e;
  }
  if (!changed.length) return { text: 'Nothing changed: the boards are already like that.' };
  deps.memory.lastEditAt = deps.now();
  await deps.log(`Saved: ${changed.join('; ')}`);
  const saved = `Saved:\n${list(changed)}`;

  // simple: "still there" means making the edit again changes nothing. If the owner changes the
  // same item in the app within these few seconds, the connector's version is put back over it.
  // Job C (merging edits with merge.ts) would remove the need for this check.
  try {
    return await checkAfter(deps, edit, changed, saved);
  } catch (e) {
    // Saved, but reading it back failed (offline, say): say so rather than "not saved".
    return { text: `${saved}\n\n(It couldn’t be checked a moment later: ${e instanceof Error ? e.message : String(e)})` };
  }
}

async function checkAfter(deps: SaveDeps, edit: Edit, changed: string[], saved: string): Promise<SaveResult> {
  await deps.wait(PUT_BACK_MS);
  if (await stillThere(deps.db, edit)) return { text: saved };
  try {
    await commit(deps, edit);
  } catch (e) {
    if (!(e instanceof Stop)) throw e;
    await deps.log(`Saved over by the app; couldn’t put back: ${changed.join('; ')}`);
    return { text: `${saved}\n\nBut BusyAnts saved over it a moment later, and it couldn’t be put back: ${e.message}`, isError: true };
  }
  await deps.wait(PUT_BACK_MS);
  if (await stillThere(deps.db, edit)) {
    await deps.log(`Saved over by the app; put back: ${changed.join('; ')}`);
    return { text: `${saved}\n\n(BusyAnts saved over this a moment later; the connector put it back.)` };
  }
  await deps.log(`Saved over by the app twice; not put back again: ${changed.join('; ')}`);
  return {
    text: `${saved}\n\nBut BusyAnts saved over it a moment later, twice, so the change isn’t on the board now. Is BusyAnts open with changes being made? Read the board and try again.`,
    isError: true,
  };
}
