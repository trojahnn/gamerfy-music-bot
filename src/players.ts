// One GuildPlayer per guild, made on first use.
import type { GuildPlayer } from './player.js';

export class Players {
  readonly #byGuild = new Map<string, GuildPlayer>();

  constructor(private readonly make: (guildId: string) => GuildPlayer) {}

  of(guildId: string): GuildPlayer {
    const existing = this.#byGuild.get(guildId);
    if (existing !== undefined) return existing;
    const created = this.make(guildId);
    this.#byGuild.set(guildId, created);
    return created;
  }
}
