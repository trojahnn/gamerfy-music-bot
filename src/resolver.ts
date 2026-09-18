// Resolves a search or a URL into a playable track and opens its audio stream.
// Everything YouTube-specific is behind the `Resolver` interface, so swapping
// YouTube for a licensed source later is a new class, not a rewrite.
import { spawn } from 'node:child_process';

export interface Track {
  readonly title: string;
  readonly durationSec: number | null;
  /** The canonical page URL the audio is opened from. */
  readonly url: string;
  /** The username who asked for it. */
  readonly requestedBy: string;
}

export interface Resolver {
  /** A search text or a URL becomes a track (title, duration, canonical URL). */
  resolve(query: string, requestedBy: string): Promise<Track>;
  /** The track's audio, as a stream to hand to the SDK's `voice.play`. */
  open(track: Track): NodeJS.ReadableStream;
}

/** The part of a spawned child this module drives — a test doubles it. */
export interface ResolverChild {
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  once(event: 'error', listener: (error: Error) => void): unknown;
  once(event: 'close', listener: (code: number | null) => void): unknown;
}

export type SpawnFn = (command: string, args: readonly string[]) => ResolverChild;

const SEARCH_PREFIX = 'ytsearch1:';

export function isUrl(text: string): boolean {
  return /^https?:\/\//i.test(text.trim());
}

/** `yt-dlp`'s `%(duration)s` is seconds, `NA` when it has none. */
export function parseDuration(raw: string | undefined): number | null {
  if (raw === undefined) return null;
  const seconds = Number(raw.trim());
  return Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : null;
}

const defaultSpawn: SpawnFn = (command, args) => spawn(command, [...args], { stdio: ['ignore', 'pipe', 'pipe'] });

export class YtDlpResolver implements Resolver {
  readonly #path: string;
  readonly #spawn: SpawnFn;

  constructor(options: { ytdlpPath?: string; spawn?: SpawnFn } = {}) {
    this.#path = options.ytdlpPath ?? 'yt-dlp';
    this.#spawn = options.spawn ?? defaultSpawn;
  }

  buildResolveArgs(query: string): string[] {
    const target = isUrl(query) ? query.trim() : `${SEARCH_PREFIX}${query.trim()}`;
    return ['--no-playlist', '--skip-download', '--print', '%(title)s\t%(duration)s\t%(webpage_url)s', target];
  }

  buildOpenArgs(url: string): string[] {
    return ['--no-playlist', '-f', 'bestaudio', '-o', '-', url];
  }

  async resolve(query: string, requestedBy: string): Promise<Track> {
    const q = query.trim();
    if (q === '') throw new Error('diga o que tocar. Ex.: /play numb - linkin park');

    const child = this.#spawn(this.#path, this.buildResolveArgs(q));
    let out = '';
    let err = '';
    child.stdout?.on('data', (chunk: unknown) => { out += String(chunk); });
    child.stderr?.on('data', (chunk: unknown) => { err += String(chunk); });

    const code = await new Promise<number | null>((resolve, reject) => {
      child.once('error', reject);
      child.once('close', resolve);
    });

    if (code !== 0) {
      const tail = lastLine(err);
      throw new Error(`não encontrei nada para "${q}".${tail === '' ? '' : ` (${tail})`}`);
    }
    const line = out.split('\n').map((piece) => piece.trim()).find((piece) => piece !== '');
    if (line === undefined) throw new Error(`não encontrei nada para "${q}".`);

    const parts = line.split('\t');
    const title = parts[0] ?? q;
    const url = (parts[2] ?? '') !== '' ? (parts[2] as string) : (isUrl(q) ? q : '');
    if (url === '') throw new Error(`o yt-dlp não devolveu a URL de "${q}".`);
    return { title, durationSec: parseDuration(parts[1]), url, requestedBy };
  }

  open(track: Track): NodeJS.ReadableStream {
    const child = this.#spawn(this.#path, this.buildOpenArgs(track.url));
    child.stderr?.resume(); // drain, so a chatty yt-dlp does not buffer forever
    if (child.stdout === null) throw new Error('o yt-dlp não abriu o áudio da faixa.');
    return child.stdout;
  }
}

function lastLine(text: string): string {
  const lines = text.split('\n').map((piece) => piece.trim()).filter((piece) => piece !== '');
  return lines.length === 0 ? '' : (lines[lines.length - 1] as string);
}
