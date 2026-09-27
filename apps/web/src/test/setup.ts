import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { afterEach } from 'vitest';

/**
 * `findBy*` and `waitFor` poll for up to `asyncUtilTimeout` (1000ms by default). A page
 * that resolves an API mock, re-renders and then paints can exceed that when the whole
 * suite runs in parallel, so a correct render was reported as a missing element. Raise
 * the polling budget to match `testTimeout` in vitest.config.ts. This only widens how
 * long we wait for a real result; it never shortens or skips an assertion.
 */
configure({ asyncUtilTimeout: 5000 });

// jsdom has no object URL support; a stable stub keeps local image previews testable.
if (typeof URL.createObjectURL !== 'function') {
  let objectUrlCount = 0;
  Object.defineProperty(URL, 'createObjectURL', {
    value: () => `blob:preview/${(objectUrlCount += 1)}`,
    writable: true,
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    value: () => undefined,
    writable: true,
  });
}

afterEach(() => {
  cleanup();
});
