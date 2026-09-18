import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { formatDuration, GuildPlayer, type Connection, type PlayerDeps } from '../player.js';
import type { Resolver, Track } from '../resolver.js';

function dummyStream(): NodeJS.ReadableStream {
  return new EventEmitter() as unknown as NodeJS.ReadableStream;
}

/** A voice connection whose `play()` hangs until the track "ends" — `endCurrent`
 * (a natural finish) or `stop` (skip/stop) both resolve it. */
class FakeConnection implements Connection {
  playCalls = 0;
  left = false;
  #end: (() => void) | null = null;
  async play(): Promise<void> {
    this.playCalls += 1;
    await new Promise<void>((resolve) => {
      this.#end = resolve;
    });
  }
  endCurrent(): void {
    const end = this.#end;
    this.#end = null;
    end?.();
  }
  stop(): void {
    this.endCurrent();
  }
  async leave(): Promise<void> {
    this.left = true;
  }
}

function make(overrides: { voiceChannelId?: string | null; resolve?: Resolver['resolve']; maxQueue?: number } = {}) {
  const said: string[] = [];
  const connection = new FakeConnection();
  const resolve: Resolver['resolve'] =
    overrides.resolve ??
    (async (query: string, requestedBy: string): Promise<Track> => ({ title: query, durationSec: 100, url: `https://x/${query}`, requestedBy }));
  const resolver: Resolver = { resolve: vi.fn(resolve), open: vi.fn(() => dummyStream()) };
  const deps: PlayerDeps = {
    resolver,
    maxQueue: overrides.maxQueue ?? 3,
    join: vi.fn(async () => connection),
    voiceChannelOf: vi.fn(() => (overrides.voiceChannelId === undefined ? 'vc1' : overrides.voiceChannelId)),
    say: vi.fn(async (_channelId: string, text: string) => {
      said.push(text);
    }),
  };
  return { player: new GuildPlayer('g1', deps), connection, deps, said };
}

const ana = { id: 'u1', username: 'ana' };
const said = (bucket: string[], needle: string): boolean => bucket.some((text) => text.includes(needle));

describe('formatDuration', () => {
  it('renders m:ss, and null as ao vivo', () => {
    expect(formatDuration(185)).toBe('3:05');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(null)).toBe('ao vivo');
  });
});

describe('GuildPlayer', () => {
  it('joins, announces, plays, and leaves when the queue empties', async () => {
    const { player, connection, said: bucket, deps } = make();
    await player.play('song a', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(1));
    expect(deps.join).toHaveBeenCalledWith('vc1');
    expect(said(bucket, 'Tocando agora')).toBe(true);
    expect(said(bucket, 'song a')).toBe(true);

    connection.endCurrent(); // the track finishes on its own
    await vi.waitFor(() => expect(connection.left).toBe(true));
    expect(said(bucket, 'A fila acabou')).toBe(true);
  });

  it('refuses to play when the asker is in no voice channel', async () => {
    const { player, said: bucket, deps } = make({ voiceChannelId: null });
    await player.play('x', ana, 'tc1');
    expect(said(bucket, 'Entre numa sala de voz primeiro.')).toBe(true);
    expect(deps.join).not.toHaveBeenCalled();
  });

  it('queues while playing and skip advances to the next', async () => {
    const { player, connection, said: bucket } = make();
    await player.play('a', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(1));
    await player.play('b', ana, 'tc1');
    expect(said(bucket, 'Na fila (posição 1)')).toBe(true);
    expect(said(bucket, 'b')).toBe(true);

    await player.skip('tc1');
    expect(said(bucket, 'Pulei')).toBe(true);
    await vi.waitFor(() => expect(connection.playCalls).toBe(2));
    expect(bucket.filter((text) => text.includes('Tocando agora')).length).toBe(2);
  });

  it('stop clears the queue and leaves', async () => {
    const { player, connection, said: bucket } = make();
    await player.play('a', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(1));
    await player.stop('tc1');
    expect(said(bucket, 'Parei e saí da sala.')).toBe(true);
    await vi.waitFor(() => expect(connection.left).toBe(true));
    expect(said(bucket, 'A fila acabou')).toBe(false);
  });

  it('says nothing plays for skip/queue/np when idle', async () => {
    const { player, said: bucket } = make();
    await player.skip('tc1');
    await player.showQueue('tc1');
    await player.nowPlaying('tc1');
    expect(said(bucket, 'Não há nada tocando.')).toBe(true);
    expect(said(bucket, 'A fila está vazia.')).toBe(true);
    expect(said(bucket, 'Nada tocando.')).toBe(true);
  });

  it('reports a resolve failure and does not join', async () => {
    const { player, said: bucket, deps } = make({
      resolve: async () => {
        throw new Error('não encontrei nada para "zzz".');
      },
    });
    await player.play('zzz', ana, 'tc1');
    expect(said(bucket, 'Não consegui:')).toBe(true);
    expect(said(bucket, 'não encontrei nada')).toBe(true);
    expect(deps.join).not.toHaveBeenCalled();
  });

  it('enforces the max queue', async () => {
    const { player, connection, said: bucket } = make({ maxQueue: 2 });
    await player.play('a', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(1));
    await player.play('b', ana, 'tc1'); // current a + queued b = 2, at the limit
    await player.play('c', ana, 'tc1'); // over the limit
    expect(said(bucket, 'A fila está cheia')).toBe(true);
  });
});
