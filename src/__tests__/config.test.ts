import { describe, expect, it } from 'vitest';
import { loadConfig } from '../config.js';

describe('loadConfig', () => {
  it('reads the token and defaults the rest', () => {
    expect(loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x' })).toEqual({
      token: 'gfb_x',
      apiUrl: 'https://api.gamerfy.gg',
      prefix: '/',
      maxQueue: 100,
      ytdlpPath: 'yt-dlp',
      ffmpegPath: 'ffmpeg',
      ytdlpExtraArgs: [],
      port: 80,
      installUrl: null,
      testTrack: null,
    });
  });

  it('MUSIC_TEST_TRACK names the local file every /play resolves to (the proof only); blank is off', () => {
    expect(loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x', MUSIC_TEST_TRACK: ' /tmp/beeps.ogg ' }).testTrack).toBe('/tmp/beeps.ogg');
    expect(loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x', MUSIC_TEST_TRACK: '   ' }).testTrack).toBeNull();
  });

  it('throws without a token', () => {
    expect(() => loadConfig({})).toThrow(/GAMERFY_BOT_TOKEN/);
    expect(() => loadConfig({ GAMERFY_BOT_TOKEN: '' })).toThrow(/GAMERFY_BOT_TOKEN/);
  });

  it('rejects a non-integer or non-positive max queue', () => {
    expect(() => loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x', MUSIC_MAX_QUEUE: 'abc' })).toThrow(/MUSIC_MAX_QUEUE/);
    expect(() => loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x', MUSIC_MAX_QUEUE: '0' })).toThrow(/MUSIC_MAX_QUEUE/);
    expect(() => loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x', MUSIC_MAX_QUEUE: '1.5' })).toThrow(/MUSIC_MAX_QUEUE/);
  });

  it('rejects an empty prefix', () => {
    expect(() => loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x', MUSIC_PREFIX: '' })).toThrow(/MUSIC_PREFIX/);
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x', PORT: '0' })).toThrow(/PORT/);
    expect(() => loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x', PORT: '70000' })).toThrow(/PORT/);
    expect(() => loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x', PORT: 'abc' })).toThrow(/PORT/);
  });

  it('takes the overrides', () => {
    const config = loadConfig({
      GAMERFY_BOT_TOKEN: 'gfb_x',
      GAMERFY_API_URL: 'http://127.0.0.1:4502/api/public',
      MUSIC_PREFIX: '!',
      MUSIC_MAX_QUEUE: '5',
      YTDLP_PATH: '/usr/bin/yt-dlp',
      FFMPEG_PATH: '/usr/bin/ffmpeg',
      PORT: '8080',
      MUSIC_INSTALL_URL: 'https://gamerfy.gg/bot/abc123',
    });
    expect(config.apiUrl).toBe('http://127.0.0.1:4502/api/public');
    expect(config.prefix).toBe('!');
    expect(config.maxQueue).toBe(5);
    expect(config.ytdlpPath).toBe('/usr/bin/yt-dlp');
    expect(config.ffmpegPath).toBe('/usr/bin/ffmpeg');
    expect(config.port).toBe(8080);
    expect(config.installUrl).toBe('https://gamerfy.gg/bot/abc123');
  });

  it('treats a blank install URL as null', () => {
    expect(loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x', MUSIC_INSTALL_URL: '   ' }).installUrl).toBeNull();
  });

  it('splits extra yt-dlp args on whitespace', () => {
    expect(loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x', YTDLP_EXTRA_ARGS: '--cookies /tmp/c.txt' }).ytdlpExtraArgs).toEqual(['--cookies', '/tmp/c.txt']);
    expect(loadConfig({ GAMERFY_BOT_TOKEN: 'gfb_x' }).ytdlpExtraArgs).toEqual([]);
  });
});
