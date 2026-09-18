// Turns a chat line into a command. Pure: no I/O, so it is exhaustively tested.
// The words the bot answers to are pt-BR-friendly aliases; the command names are English.

export type Command =
  | { readonly name: 'play'; readonly query: string }
  | { readonly name: 'skip' }
  | { readonly name: 'stop' }
  | { readonly name: 'queue' }
  | { readonly name: 'nowplaying' };

/**
 * Parses `content` against `prefix`. Returns `null` when the line is not a
 * command this bot handles (a normal message, or an unknown verb) — the caller
 * then leaves it alone.
 */
export function parseCommand(content: string, prefix: string): Command | null {
  if (!content.startsWith(prefix)) return null;
  const body = content.slice(prefix.length).trim();
  if (body === '') return null;
  const space = body.indexOf(' ');
  const verb = (space === -1 ? body : body.slice(0, space)).toLowerCase();
  const rest = space === -1 ? '' : body.slice(space + 1).trim();

  switch (verb) {
    case 'play':
    case 'p':
    case 'tocar':
      return { name: 'play', query: rest };
    case 'skip':
    case 's':
    case 'next':
    case 'pular':
      return { name: 'skip' };
    case 'stop':
    case 'leave':
    case 'disconnect':
    case 'parar':
    case 'sair':
      return { name: 'stop' };
    case 'queue':
    case 'q':
    case 'fila':
      return { name: 'queue' };
    case 'nowplaying':
    case 'np':
    case 'agora':
      return { name: 'nowplaying' };
    default:
      return null;
  }
}
