import { EventEmitter } from 'node:events';
import { describe, expect, it } from 'vitest';
import { isUrl, parseDuration, YtDlpResolver, type ResolverChild, type SpawnFn } from '../resolver.js';

function stream(): NodeJS.ReadableStream {
  return Object.assign(new EventEmitter(), { resume() {} }) as unknown as NodeJS.ReadableStream;
}

/** A fake `yt-dlp`: after the caller attaches `once('close')`, it emits the
 * captured stdout/stderr and then closes with `code`. */
function fakeSpawn(result: { out?: string; err?: string; code: number }): { fn: SpawnFn; calls: string[][] } {
  const calls: string[][] = [];
  const fn: SpawnFn = (_command, args) => {
    calls.push([...args]);
    const stdout = stream();
    const stderr = stream();
    const child: ResolverChild = {
      stdout,
      stderr,
      once(event: 'error' | 'close', listener: (arg: never) => void) {
        if (event === 'close') {
          setImmediate(() => {
            if (result.out !== undefined) stdout.emit('data', Buffer.from(result.out));
            if (result.err !== undefined) stderr.emit('data', Buffer.from(result.err));
            (listener as unknown as (code: number) => void)(result.code);
          });
        }
        return child;
      },
    };
    return child;
  };
  return { fn, calls };
}

describe('isUrl / parseDuration', () => {
  it('recognises http(s) URLs', () => {
    expect(isUrl('https://youtu.be/x')).toBe(true);
    expect(isUrl('http://x')).toBe(true);
    expect(isUrl('numb linkin park')).toBe(false);
  });
  it('parses seconds, and NA/zero to null', () => {
    expect(parseDuration('185')).toBe(185);
    expect(parseDuration('NA')).toBeNull();
    expect(parseDuration('0')).toBeNull();
    expect(parseDuration(undefined)).toBeNull();
  });
});

describe('YtDlpResolver arg building', () => {
  const resolver = new YtDlpResolver();
  it('wraps a search in ytsearch1: and leaves a URL alone', () => {
    expect(resolver.buildResolveArgs('numb linkin park')).toContain('ytsearch1:numb linkin park');
    expect(resolver.buildResolveArgs('https://youtu.be/x')).toContain('https://youtu.be/x');
    expect(resolver.buildResolveArgs('x')).toContain('--skip-download');
  });
  it('opens the best audio to stdout', () => {
    expect(resolver.buildOpenArgs('https://youtu.be/x')).toEqual(['--no-playlist', '-f', 'bestaudio', '-o', '-', 'https://youtu.be/x']);
  });
});

describe('YtDlpResolver.resolve', () => {
  it('parses a title, duration and URL from a search', async () => {
    const spawn = fakeSpawn({ out: 'Numb\t185\thttps://youtu.be/abc\n', code: 0 });
    const track = await new YtDlpResolver({ spawn: spawn.fn }).resolve('numb linkin park', 'ana');
    expect(track).toEqual({ title: 'Numb', durationSec: 185, url: 'https://youtu.be/abc', requestedBy: 'ana' });
    expect(spawn.calls[0]).toContain('ytsearch1:numb linkin park');
  });

  it('gives a live stream a null duration', async () => {
    const spawn = fakeSpawn({ out: 'Live agora\tNA\thttps://youtu.be/live\n', code: 0 });
    const track = await new YtDlpResolver({ spawn: spawn.fn }).resolve('x', 'ana');
    expect(track.durationSec).toBeNull();
  });

  it('throws with the yt-dlp tail when it finds nothing', async () => {
    const spawn = fakeSpawn({ err: 'ERROR: no results\n', code: 1 });
    await expect(new YtDlpResolver({ spawn: spawn.fn }).resolve('zzz', 'ana')).rejects.toThrow(/não encontrei nada.*no results/s);
  });

  it('refuses an empty query without spawning', async () => {
    const spawn = fakeSpawn({ code: 0 });
    await expect(new YtDlpResolver({ spawn: spawn.fn }).resolve('   ', 'ana')).rejects.toThrow(/diga o que tocar/);
    expect(spawn.calls).toHaveLength(0);
  });
});

describe('YtDlpResolver.open', () => {
  it('returns the child stdout stream', () => {
    const spawn = fakeSpawn({ code: 0 });
    const out = new YtDlpResolver({ spawn: spawn.fn }).open({ title: 't', durationSec: 1, url: 'https://youtu.be/x', requestedBy: 'ana' });
    expect(out).toBeDefined();
    expect(spawn.calls[0]).toContain('bestaudio');
  });
});
