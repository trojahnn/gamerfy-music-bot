import { describe, expect, it, vi } from 'vitest';
import { formatDuration, GuildPlayer, type Connection, type PlayerDeps } from '../player.js';
import type { Resolver, Track } from '../resolver.js';

/** A voice connection whose `play()` hangs until the track "ends": `endCurrent()`
 * (natural finish) resolves it, `endCurrent(error)` rejects it (a bad stream),
 * and `stop()` (skip/stop) resolves it. */
class FakeConnection implements Connection {
  playCalls = 0;
  left = false;
  #end: ((error?: Error) => void) | null = null;
  async play(): Promise<void> {
    this.playCalls += 1;
    await new Promise<void>((resolve, reject) => {
      this.#end = (error) => (error ? reject(error) : resolve());
    });
  }
  endCurrent(error?: Error): void {
    const end = this.#end;
    this.#end = null;
    end?.(error);
  }
  stop(): void {
    this.endCurrent();
  }
  async leave(): Promise<void> {
    this.left = true;
  }
}

function make(overrides: { voiceChannelId?: string | null; resolve?: Resolver['resolve']; maxQueue?: number; joinError?: Error } = {}) {
  const said: string[] = [];
  const connection = new FakeConnection();
  const resolve: Resolver['resolve'] =
    overrides.resolve ??
    (async (query: string, requestedBy: string): Promise<Track> => ({ title: query, durationSec: 100, url: `https://x/${query}`, requestedBy }));
  const resolver: Resolver = { resolve: vi.fn(resolve), open: vi.fn(() => ({}) as unknown as NodeJS.ReadableStream) };
  const join = vi.fn(async () => {
    if (overrides.joinError !== undefined) throw overrides.joinError;
    return connection;
  });
  const deps: PlayerDeps = {
    resolver,
    maxQueue: overrides.maxQueue ?? 3,
    join,
    voiceChannelOf: vi.fn(() => (overrides.voiceChannelId === undefined ? 'vc1' : overrides.voiceChannelId)),
    say: vi.fn(async (_channelId: string, text: string) => {
      said.push(text);
    }),
  };
  return { player: new GuildPlayer('g1', deps), connection, deps, said };
}

const ana = { id: 'u1', username: 'ana' };
const has = (bucket: string[], needle: string): boolean => bucket.some((text) => text.includes(needle));

describe('formatDuration', () => {
  it('renders m:ss, and null as ao vivo', () => {
    expect(formatDuration(185)).toBe('3:05');
    expect(formatDuration(9)).toBe('0:09');
    expect(formatDuration(null)).toBe('ao vivo');
  });
});

describe('GuildPlayer', () => {
  it('joins, announces, plays, and leaves when the queue empties', async () => {
    const { player, connection, said, deps } = make();
    await player.play('song a', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(1));
    expect(deps.join).toHaveBeenCalledWith('vc1');
    expect(has(said, 'Tocando agora')).toBe(true);
    expect(has(said, 'song a')).toBe(true);

    connection.endCurrent();
    await vi.waitFor(() => expect(connection.left).toBe(true));
    expect(has(said, 'A fila acabou')).toBe(true);
  });

  it('refuses to play when the asker is in no voice channel', async () => {
    const { player, said, deps } = make({ voiceChannelId: null });
    await player.play('x', ana, 'tc1');
    expect(has(said, 'Entre numa sala de voz primeiro.')).toBe(true);
    expect(deps.join).not.toHaveBeenCalled();
  });

  it('play with an empty query asks what to play and does not join', async () => {
    const { player, said, deps } = make();
    await player.play('   ', ana, 'tc1');
    expect(has(said, 'Diga o que tocar')).toBe(true);
    expect(deps.join).not.toHaveBeenCalled();
  });

  it('queues while playing and skip advances to the next', async () => {
    const { player, connection, said } = make();
    await player.play('a', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(1));
    await player.play('b', ana, 'tc1');
    expect(has(said, 'Na fila (posição 1)')).toBe(true);

    await player.skip('tc1');
    expect(has(said, 'Pulei')).toBe(true);
    await vi.waitFor(() => expect(connection.playCalls).toBe(2));
    expect(said.filter((text) => text.includes('Tocando agora')).length).toBe(2);
  });

  it('a skip does not leak to the next track', async () => {
    const { player, connection } = make();
    await player.play('a', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(1));
    await player.skip('tc1'); // a is the only track → leaves after
    await vi.waitFor(() => expect(connection.left).toBe(true));
    await player.play('b', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(2)); // b plays, not skipped
  });

  it('skips a track whose play fails and continues to the next', async () => {
    const { player, connection, said } = make();
    await player.play('a', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(1));
    await player.play('b', ana, 'tc1');
    connection.endCurrent(new Error('o áudio não é Ogg'));
    await vi.waitFor(() => expect(connection.playCalls).toBe(2));
    expect(has(said, 'Pulei') && has(said, 'o áudio não é Ogg')).toBe(true);
  });

  it('reports a join failure and clears the queue', async () => {
    const { player, said } = make({ joinError: new Error('sem sala') });
    await player.play('a', ana, 'tc1');
    await vi.waitFor(() => expect(has(said, 'Não consegui entrar na sala')).toBe(true));
    expect(has(said, 'sem sala')).toBe(true);
    expect(player.isRunning).toBe(false);
  });

  it('stop clears the queue and leaves', async () => {
    const { player, connection, said } = make();
    await player.play('a', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(1));
    await player.stop('tc1');
    expect(has(said, 'Parei e saí da sala.')).toBe(true);
    await vi.waitFor(() => expect(connection.left).toBe(true));
    expect(has(said, 'A fila acabou')).toBe(false);
  });

  it('says nothing plays for skip/queue/np when idle', async () => {
    const { player, said } = make();
    await player.skip('tc1');
    await player.showQueue('tc1');
    await player.nowPlaying('tc1');
    await player.stop('tc1');
    expect(has(said, 'Não há nada tocando.')).toBe(true);
    expect(has(said, 'A fila está vazia.')).toBe(true);
    expect(has(said, 'Nada tocando.')).toBe(true);
    expect(has(said, 'Não estou tocando nada.')).toBe(true);
  });

  it('lists the current track and the queue with requesters', async () => {
    const { player, connection, said } = make({ maxQueue: 10 });
    await player.play('a', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(1));
    await player.play('b', ana, 'tc1');
    await player.play('c', ana, 'tc1');
    said.length = 0;
    await player.showQueue('tc1');
    const text = said.join('\n');
    expect(text).toContain('Tocando agora');
    expect(text).toContain('1.');
    expect(text).toContain('ana');

    said.length = 0;
    await player.nowPlaying('tc1');
    expect(has(said, 'Tocando agora') && has(said, 'ana')).toBe(true);
  });

  it('reports a resolve failure and does not join', async () => {
    const { player, said, deps } = make({
      resolve: async () => {
        throw new Error('não encontrei nada para "zzz".');
      },
    });
    await player.play('zzz', ana, 'tc1');
    expect(has(said, 'Não consegui:')).toBe(true);
    expect(has(said, 'não encontrei nada')).toBe(true);
    expect(deps.join).not.toHaveBeenCalled();
  });

  it('enforces the max queue', async () => {
    const { player, connection, said } = make({ maxQueue: 2 });
    await player.play('a', ana, 'tc1');
    await vi.waitFor(() => expect(connection.playCalls).toBe(1));
    await player.play('b', ana, 'tc1'); // current a + queued b = 2, at the limit
    await player.play('c', ana, 'tc1'); // over the limit
    expect(has(said, 'A fila está cheia')).toBe(true);
  });
});
