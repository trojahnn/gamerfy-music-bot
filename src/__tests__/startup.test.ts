import { describe, expect, it, vi } from 'vitest';
import { CloseCode, GamerfyApiError } from '@gamerfy/bot';
import { connectWithRetry, isFatalConnectError } from '../startup.js';

const timeout = () => new GamerfyApiError(504, 'gateway_timeout', 'o gateway do Gamerfy não respondeu com ready em 30000 ms', null, null);
const closed = (code: number) => new GamerfyApiError(502, 'gateway_closed', `o gateway fechou com ${String(code)} antes do ready`, { close_code: code }, null);

describe('connectWithRetry', () => {
  /** A deploy: the backend is behind the maintenance page for a while, then back. */
  it('keeps trying through an outage and resolves once the gateway answers', async () => {
    const connect = vi
      .fn<() => Promise<void>>()
      .mockRejectedValueOnce(timeout())
      .mockRejectedValueOnce(new Error('fetch failed'))
      .mockRejectedValueOnce(closed(1006))
      .mockResolvedValueOnce(undefined);
    const waits: number[] = [];
    const lines: string[] = [];

    await connectWithRetry({ connect }, { backoffMs: [10, 20, 30], sleep: async (ms) => { waits.push(ms); }, log: (line) => lines.push(line) });

    expect(connect).toHaveBeenCalledTimes(4);
    expect(waits).toEqual([10, 20, 30]);
    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('tentando de novo em 0 s');
  });

  it('the last wait repeats past the end of the backoff', async () => {
    const connect = vi.fn<() => Promise<void>>().mockRejectedValueOnce(timeout()).mockRejectedValueOnce(timeout()).mockRejectedValueOnce(timeout()).mockResolvedValueOnce(undefined);
    const waits: number[] = [];
    await connectWithRetry({ connect }, { backoffMs: [5], sleep: async (ms) => { waits.push(ms); }, log: () => undefined });
    expect(waits).toEqual([5, 5, 5]);
  });

  it.each([CloseCode.INVALID_TOKEN, CloseCode.TOKEN_ROTATED, CloseCode.REPLACED, CloseCode.BOT_RETIRED])('gives up at once on a fatal close (%i)', async (code) => {
    const connect = vi.fn<() => Promise<void>>().mockRejectedValue(closed(code));
    const sleep = vi.fn(async () => undefined);
    await expect(connectWithRetry({ connect }, { backoffMs: [1], sleep, log: () => undefined })).rejects.toMatchObject({ code: 'gateway_closed' });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('a 401 (the token itself is bad) is fatal too', () => {
    expect(isFatalConnectError(new GamerfyApiError(401, 'invalid_token', 'token inválido', null, null))).toBe(true);
    expect(isFatalConnectError(timeout())).toBe(false);
    expect(isFatalConnectError(closed(1001))).toBe(false);
    expect(isFatalConnectError(new Error('ECONNREFUSED'))).toBe(false);
  });
});
