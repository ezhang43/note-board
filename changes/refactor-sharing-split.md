## Behind the scenes: split sharing storage and comments out of sharing.ts (2026-11-23)

- Moved the device-storage helpers for shared boards (`shareStorage.ts`) and card comment / unread tracking (`shareComments.ts`) out of `src/store/sharing.ts` into their own focused files with dedicated unit tests, bringing `sharing.ts` down from 999 lines to ~860 lines.
- Replaced the four separate upload-status flags (`uploading`, `again`, `failed`, `deleting`) on each share with one typed `UploadState` state machine, preserving in-flight upload tracking if deleting a share fails.
- Nothing changes in how shared boards, comments, permissions, or saved boards work.
