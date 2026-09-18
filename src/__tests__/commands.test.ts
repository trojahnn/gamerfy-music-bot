import { describe, expect, it } from 'vitest';
import { parseCommand } from '../commands.js';

describe('parseCommand', () => {
  it('ignores lines without the prefix', () => {
    expect(parseCommand('play x', '/')).toBeNull();
    expect(parseCommand('bom dia', '/')).toBeNull();
  });

  it('parses /play with a query, keeping its case and spaces', () => {
    expect(parseCommand('/play numb - linkin park', '/')).toEqual({ name: 'play', query: 'numb - linkin park' });
    expect(parseCommand('/PLAY Numb', '/')).toEqual({ name: 'play', query: 'Numb' });
  });

  it('parses /play with no query as an empty query', () => {
    expect(parseCommand('/play', '/')).toEqual({ name: 'play', query: '' });
    expect(parseCommand('/play    ', '/')).toEqual({ name: 'play', query: '' });
  });

  it('parses every verb and its aliases', () => {
    expect(parseCommand('/p x', '/')).toEqual({ name: 'play', query: 'x' });
    expect(parseCommand('/tocar x', '/')).toEqual({ name: 'play', query: 'x' });
    expect(parseCommand('/skip', '/')).toEqual({ name: 'skip' });
    expect(parseCommand('/pular', '/')).toEqual({ name: 'skip' });
    expect(parseCommand('/stop', '/')).toEqual({ name: 'stop' });
    expect(parseCommand('/sair', '/')).toEqual({ name: 'stop' });
    expect(parseCommand('/queue', '/')).toEqual({ name: 'queue' });
    expect(parseCommand('/fila', '/')).toEqual({ name: 'queue' });
    expect(parseCommand('/np', '/')).toEqual({ name: 'nowplaying' });
    expect(parseCommand('/agora', '/')).toEqual({ name: 'nowplaying' });
  });

  it('honours a custom prefix', () => {
    expect(parseCommand('!play x', '!')).toEqual({ name: 'play', query: 'x' });
    expect(parseCommand('/play x', '!')).toBeNull();
  });

  it('returns null for an unknown verb or a bare prefix', () => {
    expect(parseCommand('/dance', '/')).toBeNull();
    expect(parseCommand('/', '/')).toBeNull();
    expect(parseCommand('/    ', '/')).toBeNull();
  });
});
