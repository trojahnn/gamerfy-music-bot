// The first connection to the gateway, kept trying until it lands.
//
// `bot.connect()` rejects when the gateway does not answer with `ready` in time
// (a deploy's maintenance page, the backend restarting, the network) — and a
// process that let that rejection escape died right there. On a container
// platform that is a crash loop for the length of the outage and, past its
// restart budget, a bot that stays dead after the backend is back (the way it
// was found on 18/09: silent for hours after a deploy). Only a refusal with no
// way back — an invalid or rotated token, a retired bot, another connection of
// the same token — is worth giving up on; everything else is waited out.
import { CloseCode, GamerfyApiError, type Bot } from '@gamerfy/bot';

/** The closes the gateway sends when trying again can never help (the SDK's own list). */
const FATAL_CLOSE_CODES: ReadonlySet<number> = new Set([CloseCode.INVALID_TOKEN, CloseCode.TOKEN_ROTATED, CloseCode.REPLACED, CloseCode.BOT_RETIRED]);

/** Whether a `connect()` rejection is one no retry can fix. */
export function isFatalConnectError(error: unknown): boolean {
  if (!(error instanceof GamerfyApiError)) return false;
  if (error.code === 'invalid_token' || error.status === 401) return true;
  if (error.code !== 'gateway_closed') return false;
  const details = error.details as { close_code?: unknown } | null;
  return typeof details?.close_code === 'number' && FATAL_CLOSE_CODES.has(details.close_code);
}

export interface ConnectRetryOptions {
  /** The waits between attempts, in ms; the last one repeats (default 2 s → 30 s). */
  backoffMs?: readonly number[];
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}

const DEFAULT_BACKOFF_MS: readonly number[] = [2_000, 4_000, 8_000, 15_000, 30_000];

/**
 * `bot.connect()` until it resolves; a fatal refusal is rethrown at once. Never
 * resolves otherwise — the caller's program starts only once the bot is up.
 */
export async function connectWithRetry(bot: Pick<Bot, 'connect'>, options: ConnectRetryOptions = {}): Promise<void> {
  const backoff = options.backoffMs ?? DEFAULT_BACKOFF_MS;
  const sleep = options.sleep ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const log = options.log ?? ((line: string) => console.error(line));
  for (let attempt = 0; ; attempt += 1) {
    try {
      await bot.connect();
      return;
    } catch (error) {
      if (isFatalConnectError(error)) throw error;
      const wait = backoff[Math.min(attempt, backoff.length - 1)] ?? 30_000;
      const reason = error instanceof Error ? error.message : String(error);
      log(`[music] o gateway do Gamerfy não respondeu (${reason}); tentando de novo em ${String(Math.round(wait / 1000))} s`);
      await sleep(wait);
    }
  }
}
