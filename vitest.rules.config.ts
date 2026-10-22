import { defineConfig } from 'vitest/config';

// The Firestore rules tests (`npm run test:rules`), kept apart from `npm test` because they need the
// local Firestore emulator, which `firebase emulators:exec` starts around this run.
export default defineConfig({
  test: {
    include: ['rules/**/*.test.ts'],
    environment: 'node',
    // Every file shares the one emulator and clears it before each test, so run files one at a time.
    fileParallelism: false,
    testTimeout: 15000,
    hookTimeout: 30000,
  },
});
