## Behind the scenes: untangle board sync watch flow (2026-11-24)

- Split the long `remote.watch` callback in `src/store/sync.ts` into four focused handlers (`handleDeletingMarker`, `reconcileHeld`, `handleFirstLoad`, and `handleRemoteUpdate`) and replaced the overlapping `ready`, `held`, `stopped`, and `failed` flags with one typed `SyncPhase` state machine.
- Replaced the `JSON.stringify` comparison when reclaiming a board from a deleted share with `deepEqual`, so matching boards saved with keys in a different order are left untouched.
- Extracted the shared `isGestureBusy(store)` helper (`src/store/gestureBusy.ts`) used by both `sync.ts` and `sharing.ts`.
- Nothing changes in how boards sync, save, or handle offline edits and account deletion.
