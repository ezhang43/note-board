// Deleting your account and data (job #63, required by Google Play for apps with sign-in).

/** A share on this person's list, with who shared it (null: gone, or no longer readable by them). */
export interface ShareOwner {
  id: string;
  owner: string | null;
}

/**
 * What deleting person `uid`'s account does to each of their shares (owner decision, 2026-10-16):
 * the ones they shared are deleted for everyone, as deleting a shared board already does; the ones
 * shared with them they only leave, so the others keep them. A share that is gone or unreadable
 * (they were removed, or a run that failed part-way deleted it) is left, which only clears their
 * own records of it.
 */
export function planShares(uid: string, shares: ShareOwner[]): { deleteForEveryone: string[]; leave: string[] } {
  return {
    deleteForEveryone: shares.filter((s) => s.owner === uid).map((s) => s.id),
    leave: shares.filter((s) => s.owner !== uid).map((s) => s.id),
  };
}

/**
 * What the confirmation says will go: how many boards are this person's (all the boards here but
 * the ones in a share someone else shared with them), how many boards they shared (each with the
 * boards inside it) and how many shared with them they leave.
 */
export function deletionCounts(boardIds: string[], shares: { boards: string[]; owner: boolean }[]) {
  const theirs = new Set(shares.filter((s) => !s.owner).flatMap((s) => s.boards));
  return {
    boards: boardIds.filter((id) => !theirs.has(id)).length,
    sharedByMe: shares.filter((s) => s.owner).length,
    sharedWithMe: shares.filter((s) => !s.owner).length,
  };
}
