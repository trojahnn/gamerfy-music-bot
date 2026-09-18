// Reads the bot's settings from the environment. User-facing errors are pt-BR;
// the code and identifiers are English (repo convention).

export interface Config {
  /** The bot token from the Gamerfy developer panel (starts with `gfb_`). */
  token: string;
  /** The public backend base URL. */
  apiUrl: string;
  /** The command prefix, e.g. `/`. */
  prefix: string;
  /** How many tracks a single guild may keep queued. */
  maxQueue: number;
  /** The `yt-dlp` binary (a name on PATH or an absolute path). */
  ytdlpPath: string;
  /** The `ffmpeg` binary (a name on PATH or an absolute path). */
  ffmpegPath: string;
  /** Extra yt-dlp args (e.g. cookies, a PO token) for YouTube's anti-bot. */
  ytdlpExtraArgs: string[];
  /** The port the landing page / health endpoint listens on. */
  port: number;
  /** The Gamerfy install link (`${site}/bot/<clientId>`), or `null` if unset. */
  installUrl: string | null;
}

function requireNonEmpty(value: string | undefined, name: string, hint: string): string {
  if (value === undefined || value === '') throw new Error(`Defina ${name}: ${hint}`);
  return value;
}

function parsePort(raw: string): number {
  const port = Number(raw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error(`PORT precisa ser uma porta válida 1..65535 (veio ${JSON.stringify(raw)}).`);
  return port;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = requireNonEmpty(env.GAMERFY_BOT_TOKEN, 'GAMERFY_BOT_TOKEN', 'o token do bot (painel de desenvolvedor do Gamerfy, começa com gfb_).');

  const rawMax = env.MUSIC_MAX_QUEUE ?? '100';
  const maxQueue = Number(rawMax);
  if (!Number.isInteger(maxQueue) || maxQueue < 1) throw new Error(`MUSIC_MAX_QUEUE precisa ser um inteiro >= 1 (veio ${JSON.stringify(rawMax)}).`);

  const prefix = env.MUSIC_PREFIX ?? '/';
  if (prefix === '') throw new Error('MUSIC_PREFIX não pode ser vazio.');

  const installUrl = (env.MUSIC_INSTALL_URL ?? '').trim();

  return {
    token,
    apiUrl: env.GAMERFY_API_URL ?? 'https://api.gamerfy.gg',
    prefix,
    maxQueue,
    ytdlpPath: env.YTDLP_PATH ?? 'yt-dlp',
    ffmpegPath: env.FFMPEG_PATH ?? 'ffmpeg',
    ytdlpExtraArgs: (env.YTDLP_EXTRA_ARGS ?? '').split(/\s+/).filter((arg) => arg !== ''),
    port: parsePort(env.PORT ?? '80'),
    installUrl: installUrl === '' ? null : installUrl,
  };
}
