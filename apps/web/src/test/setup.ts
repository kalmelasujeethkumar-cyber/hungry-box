import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

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
