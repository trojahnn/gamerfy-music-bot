// Wires the Gamerfy bot to the music player: read a `/play …` line, resolve it
// with yt-dlp, join the asker's room and play; `/skip`, `/stop`, `/queue`, `/np`.
// Also serves a landing page (and /health) so people can add the bot.
import { Bot } from '@gamerfy/bot';
import { parseCommand } from './commands.js';
import { loadConfig } from './config.js';
import { GuildPlayer } from './player.js';
import { Players } from './players.js';
import { YtDlpResolver } from './resolver.js';
import { createWebServer } from './web.js';

const config = loadConfig();
const bot = new Bot({ token: config.token, apiUrl: config.apiUrl });
const resolver = new YtDlpResolver({ ytdlpPath: config.ytdlpPath, ffmpegPath: config.ffmpegPath, extraArgs: config.ytdlpExtraArgs });

async function say(channelId: string, text: string): Promise<void> {
  try {
    await bot.messages.send(channelId, text);
  } catch (error) {
    console.error('[music] não consegui responder no canal', error);
  }
}

const players = new Players(
  (guildId) =>
    new GuildPlayer(guildId, {
      resolver,
      maxQueue: config.maxQueue,
      join: (channelId) => bot.voice.join(channelId),
      voiceChannelOf: (userId) => bot.voiceChannelOf(guildId, userId),
      say,
    }),
);

bot.on('message', async (message) => {
  // `content` is null when the bot may not read the channel and was not
  // mentioned — nothing to parse then.
  if (message.content === null) return;
  const command = parseCommand(message.content, config.prefix);
  if (command === null) return;

  const player = players.of(message.guildId);
  const requester = { id: message.author.id, username: message.author.username };
  switch (command.name) {
    case 'play':
      await player.play(command.query, requester, message.channelId);
      return;
    case 'skip':
      await player.skip(message.channelId);
      return;
    case 'stop':
      await player.stop(message.channelId);
      return;
    case 'queue':
      await player.showQueue(message.channelId);
      return;
    case 'nowplaying':
      await player.nowPlaying(message.channelId);
      return;
  }
});

bot.on('error', (error) => console.error('[music]', error.message));

const web = createWebServer({
  botName: () => bot.user?.username ?? null,
  installUrl: config.installUrl,
  prefix: config.prefix,
});
web.listen(config.port, () => console.log(`[music] página no ar na porta ${String(config.port)}`));

await bot.connect();
console.log(`[music] no ar como ${bot.user?.username ?? 'bot'}`);

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    console.log(`[music] ${signal}: saindo…`);
    web.close();
    void bot.destroy().then(() => process.exit(0));
  });
}
