import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
    /**
     * These suites render real pages that resolve async API mocks before asserting, and
     * the full run executes many files in parallel on one machine. Under that load the
     * event loop can delay a single macrotask well past Testing Library's 1000ms default,
     * which produced nondeterministic "unable to find element" failures that vanished
     * when the same file ran alone. The budget below is generous enough for a loaded
     * parallel run; assertions themselves are unchanged.
     */
    testTimeout: 20000,
    hookTimeout: 20000,
  },
});
