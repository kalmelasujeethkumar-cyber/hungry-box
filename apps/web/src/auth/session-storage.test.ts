import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  clearSession,
  consumeSessionExpiredFlag,
  loadSession,
  markSessionExpired,
  saveSession,
} from './session-storage';
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
  vi.stubGlobal('sessionStorage', createLocalStorageMock());
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

describe('session-expired flag', () => {
  it('reports no expiry for a fresh visit', () => {
    expect(consumeSessionExpiredFlag()).toBe(false);
  });

  it('reports the expiry exactly once', () => {
    markSessionExpired();
    /**
     * Consumed on read so a stale notice cannot reappear on an unrelated later visit, and
     * so the login screen does not need to remember that it already said something.
     */
    expect(consumeSessionExpiredFlag()).toBe(true);
    expect(consumeSessionExpiredFlag()).toBe(false);
  });

  it('keeps the flag out of the stored session', () => {
    saveSession({ token: 'token-1', user: demoUser });
    markSessionExpired();
    /**
     * The flag is a boolean and must never be conflated with credentials. It also has to
     * survive clearing the session, which is exactly what happens on a 401.
     */
    clearSession();
    expect(loadSession()).toBeNull();
    expect(consumeSessionExpiredFlag()).toBe(true);
  });

  it('survives storage being unavailable', () => {
    vi.stubGlobal('sessionStorage', {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    });
    expect(() => markSessionExpired()).not.toThrow();
    expect(consumeSessionExpiredFlag()).toBe(false);
  });
});
