import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearSession, loadSession, saveSession } from './session-storage';
import type { AuthUser } from '@hungrybox/shared';

function createLocalStorageMock(): Storage {
  const store = new Map<string, string>();
  const storage = {
    get length() {
      return store.size;
    },
    clear: () => {
      store.clear();
    },
    getItem: (key: string) => store.get(key) ?? null,
    key: (index: number) => Array.from(store.keys())[index] ?? null,
    removeItem: (key: string) => {
      store.delete(key);
    },
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
  };
  return storage;
}

const demoUser: AuthUser = {
  id: 'u1',
  loginId: 'admin@gmail.com',
  email: 'admin@gmail.com',
  name: 'Super Admin',
  role: 'SUPER_ADMIN',
  status: 'ACTIVE',
  branchId: null,
};

beforeEach(() => {
  vi.stubGlobal('localStorage', createLocalStorageMock());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('session-storage', () => {
  it('round-trips a stored session', () => {
    saveSession({ token: 'token-1', user: demoUser });
    const restored = loadSession();
    expect(restored).toEqual({ token: 'token-1', user: demoUser });
  });

  it('returns null when nothing is stored', () => {
    expect(loadSession()).toBeNull();
  });

  it('returns null for corrupt JSON', () => {
    localStorage.setItem('hungrybox.session', '{not-json');
    expect(loadSession()).toBeNull();
  });

  it('returns null for a session missing a token or user', () => {
    localStorage.setItem('hungrybox.session', JSON.stringify({ token: 'x' }));
    expect(loadSession()).toBeNull();
  });

  it('clears a stored session', () => {
    saveSession({ token: 'token-1', user: demoUser });
    clearSession();
    expect(loadSession()).toBeNull();
  });
});
