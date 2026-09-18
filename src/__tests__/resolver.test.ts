import { EventEmitter } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
import { isUrl, parseDuration, RESOLVE_TIMEOUT_MS, YtDlpResolver, type SpawnFn } from '../resolver.js';

class FakeStream extends EventEmitter {
  resume(): this {
    return this;
  }
  pipe(): this {
    return this;
  }
  destroy = vi.fn();
}

class FakeChild extends EventEmitter {
  stdin = new FakeStream();
  stdout = new FakeStream();
  stderr = new FakeStream();
  kill = vi.fn();
}

function makeSpawn(): { fn: SpawnFn; children: FakeChild[]; commands: { command: string; args: string[] }[] } {
  const children: FakeChild[] = [];
  const commands: { command: string; args: string[] }[] = [];
  const fn = ((command: string, args: readonly string[]) => {
    commands.push({ command, args: [...args] });
    const child = new FakeChild();
    children.push(child);
    return child;
  }) as unknown as SpawnFn;
  return { fn, children, commands };
}

describe('isUrl / parseDuration', () => {
  it('recognises http(s) URLs', () => {
    expect(isUrl('https://youtu.be/x')).toBe(true);
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
  it('opens the best audio to stdout and transcodes to Ogg Opus', () => {
    expect(resolver.buildYtdlpArgs('https://youtu.be/x')).toEqual(['--no-playlist', '-f', 'bestaudio', '-o', '-', 'https://youtu.be/x']);
    const ff = resolver.buildFfmpegArgs();
    expect(ff).toContain('libopus');
    expect(ff.join(' ')).toContain('-f ogg');
    expect(ff).toContain('pipe:1');
  });
});

describe('YtDlpResolver.resolve', () => {
  it('parses a title, duration and URL from a search', async () => {
    const spawn = makeSpawn();
    const promise = new YtDlpResolver({ spawn: spawn.fn }).resolve('numb linkin park', 'ana');
    const child = spawn.children[0]!;
    child.stdout.emit('data', Buffer.from('Numb\t185\thttps://youtu.be/abc\n'));
    child.emit('close', 0);
    expect(await promise).toEqual({ title: 'Numb', durationSec: 185, url: 'https://youtu.be/abc', requestedBy: 'ana' });
    expect(spawn.commands[0]!.args).toContain('ytsearch1:numb linkin park');
  });

  it('gives a live stream a null duration', async () => {
    const spawn = makeSpawn();
    const promise = new YtDlpResolver({ spawn: spawn.fn }).resolve('x', 'ana');
    spawn.children[0]!.stdout.emit('data', Buffer.from('Live\tNA\thttps://youtu.be/live\n'));
    spawn.children[0]!.emit('close', 0);
    expect((await promise).durationSec).toBeNull();
  });

  it('throws with the yt-dlp tail when it finds nothing', async () => {
    const spawn = makeSpawn();
    const promise = new YtDlpResolver({ spawn: spawn.fn }).resolve('zzz', 'ana');
    spawn.children[0]!.stderr.emit('data', Buffer.from('ERROR: no results\n'));
    spawn.children[0]!.emit('close', 1);
    await expect(promise).rejects.toThrow(/não encontrei nada.*no results/s);
  });

  it('refuses an empty query without spawning', async () => {
    const spawn = makeSpawn();
    await expect(new YtDlpResolver({ spawn: spawn.fn }).resolve('   ', 'ana')).rejects.toThrow(/diga o que tocar/);
    expect(spawn.children).toHaveLength(0);
  });

  it('kills a hung yt-dlp after the timeout', async () => {
    vi.useFakeTimers();
    try {
      const spawn = makeSpawn();
      const promise = new YtDlpResolver({ spawn: spawn.fn }).resolve('x', 'ana');
      const rejects = expect(promise).rejects.toThrow(/demorou demais/);
      await vi.advanceTimersByTimeAsync(RESOLVE_TIMEOUT_MS + 10);
      await rejects;
      expect(spawn.children[0]!.kill).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('YtDlpResolver.open', () => {
  it('pipes yt-dlp into ffmpeg and returns ffmpeg stdout', () => {
    const spawn = makeSpawn();
    const out = new YtDlpResolver({ spawn: spawn.fn }).open({ title: 't', durationSec: 1, url: 'https://youtu.be/x', requestedBy: 'ana' });
    expect(spawn.commands.map((c) => c.command)).toEqual(['yt-dlp', 'ffmpeg']);
    expect(spawn.commands[0]!.args).toContain('bestaudio');
    expect(out).toBe(spawn.children[1]!.stdout);
  });

  it('kills both children when the output stream closes', () => {
    const spawn = makeSpawn();
    const out = new YtDlpResolver({ spawn: spawn.fn }).open({ title: 't', durationSec: 1, url: 'https://x', requestedBy: 'ana' });
    out.emit('close');
    expect(spawn.children[0]!.kill).toHaveBeenCalled();
    expect(spawn.children[1]!.kill).toHaveBeenCalled();
  });

  it('kills both and destroys the stream on a child error', () => {
    const spawn = makeSpawn();
    new YtDlpResolver({ spawn: spawn.fn }).open({ title: 't', durationSec: 1, url: 'https://x', requestedBy: 'ana' });
    spawn.children[0]!.emit('error', new Error('ENOENT'));
    expect(spawn.children[0]!.kill).toHaveBeenCalled();
    expect(spawn.children[1]!.kill).toHaveBeenCalled();
    expect((spawn.children[1]!.stdout as FakeStream).destroy).toHaveBeenCalled();
  });
});
