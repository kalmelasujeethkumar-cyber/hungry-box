import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { apiRequest } from './client';
import { SESSION_EXPIRED_EVENT } from './session-expiry';

const fetchMock = vi.fn();

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  vi.spyOn(window, 'dispatchEvent');
});

afterEach(() => {
  vi.restoreAllMocks();
});

function jsonResponse(status: number, body = '{}'): Response {
  return new Response(body, { status });
}

describe('apiRequest 401 handling', () => {
  it('broadcasts session expiry and throws when an authenticated request returns 401', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401));
    const promise = apiRequest('/orders', { token: 'stale-token' });

    await expect(promise).rejects.toMatchObject({ status: 401 });
    expect(window.dispatchEvent).toHaveBeenCalledWith(
      expect.objectContaining({ type: SESSION_EXPIRED_EVENT }),
    );
  });

  it('does not broadcast for a public login 401 (no token)', async () => {
    fetchMock.mockResolvedValue(jsonResponse(401, '{"message":"Invalid credentials"}'));
    await expect(apiRequest('/auth/login', { method: 'POST', body: {} })).rejects.toMatchObject({
      status: 401,
    });
    expect(window.dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: SESSION_EXPIRED_EVENT }),
    );
  });

  it('does not treat a 403 (e.g. suspension) as session expiry', async () => {
    fetchMock.mockResolvedValue(jsonResponse(403));
    await expect(apiRequest('/orders', { token: 'still-valid-token' })).rejects.toMatchObject({
      status: 403,
    });
    expect(window.dispatchEvent).not.toHaveBeenCalledWith(
      expect.objectContaining({ type: SESSION_EXPIRED_EVENT }),
    );
  });
});
