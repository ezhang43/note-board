/**
 * The letter a keyboard shortcut is matched on. Normally the typed letter (so AZERTY's A is A), but
 * on non-Latin layouts (Russian, Greek, …) the key's position, so Ctrl+Z still undoes there.
 */
export function shortcutKey(e: { key: string; code: string }): string {
  const position = /^Key([A-Z])$/.exec(e.code);
  if (position && e.key.length === 1 && !/[a-z]/i.test(e.key)) return position[1].toLowerCase();
  return e.key.toLowerCase();
}
