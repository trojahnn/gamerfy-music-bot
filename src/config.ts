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
}

function requireNonEmpty(value: string | undefined, name: string, hint: string): string {
  if (value === undefined || value === '') throw new Error(`Defina ${name}: ${hint}`);
  return value;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const token = requireNonEmpty(env.GAMERFY_BOT_TOKEN, 'GAMERFY_BOT_TOKEN', 'o token do bot (painel de desenvolvedor do Gamerfy, começa com gfb_).');

  const rawMax = env.MUSIC_MAX_QUEUE ?? '100';
  const maxQueue = Number(rawMax);
  if (!Number.isInteger(maxQueue) || maxQueue < 1) throw new Error(`MUSIC_MAX_QUEUE precisa ser um inteiro >= 1 (veio ${JSON.stringify(rawMax)}).`);

  const prefix = env.MUSIC_PREFIX ?? '/';
  if (prefix === '') throw new Error('MUSIC_PREFIX não pode ser vazio.');

  return {
    token,
    apiUrl: env.GAMERFY_API_URL ?? 'https://api.gamerfy.gg',
    prefix,
    maxQueue,
    ytdlpPath: env.YTDLP_PATH ?? 'yt-dlp',
  };
}
