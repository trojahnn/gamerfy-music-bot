// The per-guild player: a queue, the track in flight, and the voice connection.
// One `#run` loop per guild advances the queue and hangs up when it empties.
import type { Resolver, Track } from './resolver.js';

/** The slice of the SDK's `VoiceConnection` this needs — a test doubles it. */
export interface Connection {
  play(input: NodeJS.ReadableStream | string): Promise<void>;
  stop(): void;
  leave(): Promise<void>;
}

export interface PlayerDeps {
  readonly resolver: Resolver;
  readonly maxQueue: number;
  /** Opens a voice connection to a channel (the SDK's `voice.join`). */
  join(channelId: string): Promise<Connection>;
  /** The voice channel the user is in, in THIS guild, or `null`. */
  voiceChannelOf(userId: string): string | null;
  /** Replies in a text channel (the SDK's `messages.send`), never throwing. */
  say(channelId: string, text: string): Promise<void>;
}

export interface Requester {
  readonly id: string;
  readonly username: string;
}

export function formatDuration(seconds: number | null): string {
  if (seconds === null) return 'ao vivo';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m)}:${String(s).padStart(2, '0')}`;
}

function label(track: Track): string {
  return `**${track.title}** (${formatDuration(track.durationSec)})`;
}

/** Duck-typed: a refusal the SDK minted with `code === 'missing_permission'`. */
function isMissingPermission(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && (error as { code: unknown }).code === 'missing_permission';
}

function reason(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export class GuildPlayer {
  readonly #queue: Track[] = [];
  #current: Track | null = null;
  #connection: Connection | null = null;
  #running = false;
  #stopping = false;
  /** Set by skip(); the loop drops the current/next track and clears it. */
  #skipRequested = false;
  /** The last room joined, to resume if a track is queued during tear-down. */
  #lastVoiceChannelId: string | null = null;
  /** Where announcements go — the last channel a command came from. */
  #announceChannelId: string | null = null;

  constructor(
    private readonly guildId: string,
    private readonly deps: PlayerDeps,
  ) {}

  get isRunning(): boolean {
    return this.#running;
  }

  #atCapacity(): boolean {
    return this.#queue.length + (this.#current === null ? 0 : 1) >= this.deps.maxQueue;
  }

  async play(query: string, requester: Requester, channelId: string): Promise<void> {
    this.#announceChannelId = channelId;
    if (query.trim() === '') {
      await this.deps.say(channelId, 'Diga o que tocar. Ex.: `/play numb - linkin park`');
      return;
    }
    const voiceChannelId = this.deps.voiceChannelOf(requester.id);
    if (voiceChannelId === null) {
      await this.deps.say(channelId, 'Entre numa sala de voz primeiro.');
      return;
    }
    if (this.#atCapacity()) {
      await this.deps.say(channelId, `A fila está cheia (limite de ${String(this.deps.maxQueue)}).`);
      return;
    }

    let track: Track;
    try {
      track = await this.deps.resolver.resolve(query, requester.username);
    } catch (error) {
      await this.deps.say(channelId, `Não consegui: ${reason(error)}`);
      return;
    }

    // Re-check after the await: concurrent /play calls could have filled it.
    if (this.#atCapacity()) {
      await this.deps.say(channelId, `A fila está cheia (limite de ${String(this.deps.maxQueue)}).`);
      return;
    }

    this.#queue.push(track);
    if (this.#running) {
      await this.deps.say(channelId, `Na fila (posição ${String(this.#queue.length)}): ${label(track)}`);
      return;
    }
    // Not running: start the loop. It announces "Tocando agora" once in the
    // room. `void`: play() returns now; the loop owns the rest.
    void this.#run(voiceChannelId);
  }

  skip(channelId: string): Promise<void> {
    this.#announceChannelId = channelId;
    if (this.#current === null) return this.deps.say(channelId, 'Não há nada tocando.');
    const skipped = this.#current;
    this.#skipRequested = true; // caught by the loop even if play() has not started yet
    this.#connection?.stop(); // ends the awaited play(); the loop advances
    return this.deps.say(channelId, `Pulei ${label(skipped)}.`);
  }

  stop(channelId: string): Promise<void> {
    this.#announceChannelId = channelId;
    if (!this.#running) return this.deps.say(channelId, 'Não estou tocando nada.');
    this.#stopping = true;
    this.#queue.length = 0;
    this.#connection?.stop(); // ends the current track; the loop sees #stopping and leaves
    return this.deps.say(channelId, 'Parei e saí da sala.');
  }

  showQueue(channelId: string): Promise<void> {
    if (this.#current === null && this.#queue.length === 0) return this.deps.say(channelId, 'A fila está vazia.');
    const lines: string[] = [];
    if (this.#current !== null) lines.push(`Tocando agora: ${label(this.#current)} — pedido por ${this.#current.requestedBy}`);
    this.#queue.slice(0, 10).forEach((track, index) => {
      lines.push(`${String(index + 1)}. ${label(track)} — ${track.requestedBy}`);
    });
    if (this.#queue.length > 10) lines.push(`… e mais ${String(this.#queue.length - 10)}.`);
    return this.deps.say(channelId, lines.join('\n'));
  }

  nowPlaying(channelId: string): Promise<void> {
    if (this.#current === null) return this.deps.say(channelId, 'Nada tocando.');
    return this.deps.say(channelId, `Tocando agora: ${label(this.#current)} — pedido por ${this.#current.requestedBy}`);
  }

  async #run(voiceChannelId: string): Promise<void> {
    if (this.#running) return; // never two loops (never two joins) for one guild
    this.#running = true;
    this.#stopping = false;
    this.#skipRequested = false;
    this.#lastVoiceChannelId = voiceChannelId;

    try {
      this.#connection = await this.deps.join(voiceChannelId);
    } catch (error) {
      this.#running = false;
      this.#queue.length = 0;
      if (this.#announceChannelId !== null) await this.deps.say(this.#announceChannelId, `Não consegui entrar na sala: ${reason(error)}`);
      return;
    }

    try {
      while (this.#queue.length > 0 && !this.#stopping) {
        const track = this.#queue.shift() as Track;
        this.#current = track;
        if (this.#skipRequested) {
          this.#skipRequested = false; // a skip landed before this track started
          this.#current = null;
          continue;
        }
        const channelId = this.#announceChannelId;
        if (channelId !== null) await this.deps.say(channelId, `Tocando agora: ${label(track)}`);
        if (this.#skipRequested) {
          this.#skipRequested = false; // …or during that announce
          this.#current = null;
          continue;
        }

        try {
          await this.#connection.play(this.deps.resolver.open(track));
        } catch (error) {
          if (isMissingPermission(error)) {
            this.#stopping = true;
            if (channelId !== null) await this.deps.say(channelId, 'Não tenho permissão de falar nessa sala. Saí.');
          } else if (channelId !== null) {
            await this.deps.say(channelId, `Pulei ${label(track)}: ${reason(error)}`);
          }
        }
        this.#skipRequested = false; // consume a skip that ended this track
        this.#current = null;
      }
    } finally {
      const connection = this.#connection;
      const stopping = this.#stopping;
      this.#connection = null;
      this.#current = null;
      // #running stays true across leave(), so no second #run (double join) can
      // start while this one is hanging up.
      await connection?.leave().catch(() => undefined);
      this.#running = false;

      if (!stopping && this.#announceChannelId !== null) await this.deps.say(this.#announceChannelId, 'A fila acabou. Saí da sala.');
      // A track queued during the tear-down above would be orphaned: pick it up.
      if (!this.#stopping && this.#queue.length > 0 && this.#lastVoiceChannelId !== null) void this.#run(this.#lastVoiceChannelId);
    }
  }
}
