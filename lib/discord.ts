import { randomUUID } from "crypto";
import db from "./db";

const DISCORD_API_BASE = "https://discord.com/api/v10";

export interface DiscordChannel {
  id: string;
  guild_id: string;
  name: string;
  type: 0;
}

export interface DiscordMessage {
  message_id: string;
  guild_id: string;
  guild_name: string;
  channel_id: string;
  channel_name: string;
  author_id: string;
  author_name: string;
  content: string;
  timestamp: string;
  is_bot: boolean;
  embeds: unknown[];
  attachments: unknown[];
}

interface DiscordConfig {
  token: string;
  guildIds: string[];
  seedChannelIds: string[];
  lookbackHours: number;
  includeChannels: Set<string> | null;
  excludeChannels: Set<string>;
}

interface DiscordGuildPayload {
  id: string;
  name: string;
}

interface DiscordChannelPayload {
  id: string;
  guild_id?: string;
  name?: string;
  type: number;
  position?: number;
}

interface DiscordMessagePayload {
  id: string;
  type: number;
  content?: string;
  timestamp: string;
  author?: {
    id?: string;
    username?: string;
    global_name?: string | null;
    bot?: boolean;
  };
  embeds?: unknown[];
  attachments?: unknown[];
}

function parseCsv(value: string | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseChannelSet(value: string | undefined): Set<string> {
  return new Set(parseCsv(value).map((entry) => entry.toLowerCase()));
}

function getDiscordConfig(): DiscordConfig {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token) throw new Error("Discord: DISCORD_BOT_TOKEN is not set");

  const guildIds = parseCsv(process.env.DISCORD_GUILD_IDS);
  const seedChannelIds = parseCsv(process.env.DISCORD_CHANNEL_IDS);
  if (guildIds.length === 0 && seedChannelIds.length === 0) {
    throw new Error("Discord: set DISCORD_GUILD_IDS or DISCORD_CHANNEL_IDS");
  }

  const parsedLookback = Number(process.env.DISCORD_LOOKBACK_HOURS);
  const lookbackHours =
    Number.isFinite(parsedLookback) && parsedLookback > 0 ? parsedLookback : 24;
  const includeChannels = parseChannelSet(process.env.DISCORD_INCLUDE_CHANNELS);
  const excludeChannels = parseChannelSet(process.env.DISCORD_EXCLUDE_CHANNELS);

  return {
    token,
    guildIds,
    seedChannelIds,
    lookbackHours,
    includeChannels: includeChannels.size > 0 ? includeChannels : null,
    excludeChannels,
  };
}

async function discordGet<T>(
  path: string
): Promise<{ ok: true; data: T } | { ok: false; status: number; body: string }> {
  const { token } = getDiscordConfig();
  const response = await fetch(`${DISCORD_API_BASE}${path}`, {
    headers: { Authorization: `Bot ${token}` },
  });

  if (response.status === 429) {
    return { ok: false, status: response.status, body: await response.text() };
  }

  if (!response.ok) {
    return { ok: false, status: response.status, body: await response.text() };
  }

  return { ok: true, data: (await response.json()) as T };
}

function shouldIncludeChannel(
  channel: DiscordChannelPayload,
  config: DiscordConfig
): channel is DiscordChannelPayload & { name: string; guild_id: string } {
  if (channel.type !== 0 || !channel.name || !channel.guild_id) return false;

  const name = channel.name.toLowerCase();
  if (config.includeChannels) return config.includeChannels.has(name);
  return !config.excludeChannels.has(name);
}

async function getGuildName(guildId: string): Promise<string> {
  const response = await discordGet<DiscordGuildPayload>(`/guilds/${guildId}`);
  if (!response.ok) {
    console.warn(
      `Discord: failed to fetch guild ${guildId} (${response.status}): ${response.body}`
    );
    return guildId;
  }

  return response.data.name;
}

async function resolveGuilds(): Promise<Array<{ id: string; name: string }>> {
  const config = getDiscordConfig();
  const guilds = new Map<string, string>();

  for (const guildId of config.guildIds) {
    guilds.set(guildId, await getGuildName(guildId));
  }

  for (const channelId of config.seedChannelIds) {
    const response = await discordGet<DiscordChannelPayload>(`/channels/${channelId}`);
    if (!response.ok) {
      console.warn(
        `Discord: failed to resolve seed channel ${channelId} (${response.status}): ${response.body}`
      );
      continue;
    }

    if (response.data.guild_id && !guilds.has(response.data.guild_id)) {
      guilds.set(response.data.guild_id, await getGuildName(response.data.guild_id));
    }
  }

  return [...guilds.entries()].map(([id, name]) => ({ id, name }));
}

export async function listGuildChannels(
  guildId: string
): Promise<DiscordChannel[]> {
  const config = getDiscordConfig();
  const response = await discordGet<DiscordChannelPayload[]>(
    `/guilds/${guildId}/channels`
  );

  if (!response.ok) {
    if (response.status === 429) {
      console.warn("Discord rate limited while listing guild channels", guildId);
    } else {
      console.warn(
        `Discord: failed to list channels for guild ${guildId} (${response.status}): ${response.body}`
      );
    }
    return [];
  }

  return response.data
    .filter((channel) => shouldIncludeChannel(channel, config))
    .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
    .map((channel) => ({
      id: channel.id,
      guild_id: channel.guild_id,
      name: channel.name,
      type: 0,
    }));
}

function mapMessage(
  guild: { id: string; name: string },
  channel: DiscordChannel,
  message: DiscordMessagePayload
): DiscordMessage | null {
  const content = (message.content ?? "").trim();
  const embeds = message.embeds ?? [];
  const attachments = message.attachments ?? [];
  const isBot = message.author?.bot === true;

  if (isBot) return null;
  if (message.type !== 0) return null;
  if (!content && embeds.length === 0 && attachments.length === 0) return null;

  return {
    message_id: message.id,
    guild_id: guild.id,
    guild_name: guild.name,
    channel_id: channel.id,
    channel_name: channel.name,
    author_id: message.author?.id ?? "unknown",
    author_name:
      message.author?.global_name ?? message.author?.username ?? "unknown",
    content,
    timestamp: new Date(message.timestamp).toISOString(),
    is_bot: isBot,
    embeds,
    attachments,
  };
}

export async function fetchRecentMessages(): Promise<DiscordMessage[]> {
  const config = getDiscordConfig();
  const since = Date.now() - config.lookbackHours * 60 * 60 * 1000;
  const guilds = await resolveGuilds();
  const messages: DiscordMessage[] = [];

  for (const guild of guilds) {
    const channels = await listGuildChannels(guild.id);

    for (const channel of channels) {
      const response = await discordGet<DiscordMessagePayload[]>(
        `/channels/${channel.id}/messages?limit=50`
      );

      if (!response.ok) {
        if (response.status === 429) {
          console.warn("Discord rate limited while fetching channel", channel.name);
        } else {
          console.warn(
            `Discord: failed to fetch messages for #${channel.name} (${response.status}): ${response.body}`
          );
        }
        continue;
      }

      for (const rawMessage of response.data) {
        const timestamp = new Date(rawMessage.timestamp).getTime();
        if (!Number.isFinite(timestamp) || timestamp < since) continue;

        const message = mapMessage(guild, channel, rawMessage);
        if (message) messages.push(message);
      }
    }
  }

  return messages;
}

function titleForMessage(message: DiscordMessage): string {
  const content = message.content.trim();
  return content ? content.slice(0, 100) : "[image/embed only]";
}

export async function syncDiscordToItems(): Promise<{ upserted: number }> {
  const messages = await fetchRecentMessages();
  const insert = db.prepare(`
    INSERT INTO items (
      id, source, source_id, title, body, sender, timestamp, classified,
      category, urgency, financial_impact, relationship_importance,
      actionability, risk, action_required, suggested_action, reasoning,
      priority_score, user_feedback, created_at, updated_at, seed, source_account
    ) VALUES (
      ?, ?, ?, ?, ?, ?, ?, ?,
      ?, ?, ?, ?,
      ?, ?, ?, ?, ?,
      ?, ?, ?, ?, ?, ?
    )
    ON CONFLICT(source, source_id) DO UPDATE SET
      title = excluded.title,
      body = excluded.body,
      sender = excluded.sender,
      timestamp = excluded.timestamp,
      source_account = excluded.source_account,
      updated_at = excluded.updated_at
  `);

  let upserted = 0;

  for (const message of messages) {
    const now = new Date().toISOString();
    const result = insert.run(
      randomUUID(),
      "discord",
      message.message_id,
      titleForMessage(message),
      JSON.stringify(message),
      message.author_name,
      message.timestamp,
      0,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      now,
      now,
      0,
      message.channel_name
    );

    upserted += result.changes;
  }

  return { upserted };
}
