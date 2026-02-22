/**
 * Slack Web API helpers
 *
 * Uses native fetch() — no additional dependencies.
 * Every function takes an explicit token parameter.
 */

import { parse as yamlParse } from 'yaml';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface SlackMessage {
  type: string;
  subtype?: string;
  user?: string;
  bot_id?: string;
  text: string;
  ts: string;
  thread_ts?: string;
  files?: SlackFile[];
}

export interface SlackFile {
  id: string;
  name: string;
  mimetype: string;
  url_private: string;
  size: number;
}

interface SlackApiResponse {
  ok: boolean;
  error?: string;
}

// ---------------------------------------------------------------------------
// Internal helper
// ---------------------------------------------------------------------------

async function slackApi<T extends SlackApiResponse>(
  token: string,
  method: 'GET' | 'POST',
  endpoint: string,
  body?: Record<string, unknown>,
): Promise<T> {
  const url = `https://slack.com/api/${endpoint}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };

  const init: RequestInit = { method, headers };

  if (method === 'GET' && body) {
    const params = new URLSearchParams();
    for (const [k, v] of Object.entries(body)) {
      if (v !== undefined) params.set(k, String(v));
    }
    const sep = url.includes('?') ? '&' : '?';
    const fullUrl = `${url}${sep}${params.toString()}`;
    const res = await fetch(fullUrl, init);
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
      await sleep(retryAfter * 1000);
      return slackApi(token, method, endpoint, body);
    }
    const data = (await res.json()) as T;
    if (!data.ok) {
      throw new Error(`Slack API ${endpoint}: ${data.error}`);
    }
    return data;
  }

  if (body) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }

  const res = await fetch(url, init);
  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '5', 10);
    await sleep(retryAfter * 1000);
    return slackApi(token, method, endpoint, body);
  }
  const data = (await res.json()) as T;
  if (!data.ok) {
    throw new Error(`Slack API ${endpoint}: ${data.error}`);
  }
  return data;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Token resolution
// ---------------------------------------------------------------------------

export function getSlackToken(): string {
  // Env var first (matches bash slack_get_token)
  if (process.env.CRAB_SLACK_BOT_TOKEN) {
    return process.env.CRAB_SLACK_BOT_TOKEN;
  }

  // Fallback: ~/.crabcode/config.yaml
  const configPath = path.join(os.homedir(), '.crabcode', 'config.yaml');
  if (fs.existsSync(configPath)) {
    try {
      const raw = fs.readFileSync(configPath, 'utf-8');
      const config = yamlParse(raw) as Record<string, unknown>;
      const slack = config?.slack as Record<string, unknown> | undefined;
      const token = slack?.bot_token as string | undefined;
      if (token && token !== 'null') {
        return token;
      }
    } catch {
      // ignore parse errors
    }
  }

  throw new Error(
    'Slack bot token not found.\n' +
      'Set CRAB_SLACK_BOT_TOKEN env var or add slack.bot_token to ~/.crabcode/config.yaml',
  );
}

// ---------------------------------------------------------------------------
// API functions
// ---------------------------------------------------------------------------

/**
 * Get the bot's own user ID via auth.test
 */
export async function getBotUserId(token: string): Promise<string> {
  const data = await slackApi<SlackApiResponse & { user_id: string }>(
    token,
    'POST',
    'auth.test',
  );
  return data.user_id;
}

/**
 * Look up a Slack user ID by username (case-insensitive match on name, display_name, real_name)
 */
export async function getUserId(token: string, username: string): Promise<string> {
  const cleaned = username.replace(/^@/, '').toLowerCase();

  const data = await slackApi<
    SlackApiResponse & {
      members: Array<{
        id: string;
        name: string;
        real_name: string;
        profile: { display_name: string };
        deleted: boolean;
      }>;
    }
  >(token, 'GET', 'users.list', { limit: 500 });

  for (const member of data.members) {
    if (member.deleted) continue;
    if (
      member.name.toLowerCase() === cleaned ||
      member.profile.display_name.toLowerCase() === cleaned ||
      member.real_name.toLowerCase() === cleaned
    ) {
      return member.id;
    }
  }

  throw new Error(`Slack user "${username}" not found`);
}

/**
 * Open a DM channel between the bot and a user
 */
export async function openDm(token: string, userId: string): Promise<string> {
  const data = await slackApi<SlackApiResponse & { channel: { id: string } }>(
    token,
    'POST',
    'conversations.open',
    { users: userId },
  );
  return data.channel.id;
}

/**
 * Get message history from a channel/DM.
 * If oldest is provided, only returns messages newer than that timestamp.
 */
export async function getHistory(
  token: string,
  channelId: string,
  oldest?: string,
): Promise<SlackMessage[]> {
  const params: Record<string, unknown> = { channel: channelId, limit: 20 };
  if (oldest) {
    params.oldest = oldest;
  }

  const data = await slackApi<SlackApiResponse & { messages: SlackMessage[] }>(
    token,
    'GET',
    'conversations.history',
    params,
  );

  return data.messages || [];
}

/**
 * Post a message. Returns the message timestamp (usable as thread_ts).
 */
export async function postMessage(
  token: string,
  channelId: string,
  text: string,
  threadTs?: string,
): Promise<string> {
  const body: Record<string, unknown> = { channel: channelId, text };
  if (threadTs) {
    body.thread_ts = threadTs;
  }

  const data = await slackApi<SlackApiResponse & { ts: string }>(
    token,
    'POST',
    'chat.postMessage',
    body,
  );
  return data.ts;
}

/**
 * Add an emoji reaction to a message.
 * Returns true on success, false on failure (never throws).
 */
export async function addReaction(
  token: string,
  channelId: string,
  timestamp: string,
  emoji: string,
): Promise<boolean> {
  try {
    await slackApi(token, 'POST', 'reactions.add', {
      channel: channelId,
      timestamp,
      name: emoji,
    });
    return true;
  } catch (err) {
    const msg = (err as Error).message;
    // already_reacted is fine
    if (msg.includes('already_reacted')) return true;
    return false;
  }
}

/**
 * Download a file from Slack using url_private.
 * Skips binary files, returns text content.
 */
export async function downloadFile(
  token: string,
  file: SlackFile,
): Promise<{ content: string; filename: string }> {
  const res = await fetch(file.url_private, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    throw new Error(`Failed to download ${file.name}: HTTP ${res.status}`);
  }

  // Check content type — skip binary files
  const contentType = res.headers.get('Content-Type') || '';
  const textTypes = ['text/', 'application/json', 'application/yaml', 'application/xml', 'application/x-yaml'];
  const isText = textTypes.some((t) => contentType.includes(t)) || file.name.match(/\.(txt|md|json|yaml|yml|xml|csv|curl|sh|py|js|ts)$/i);

  if (!isText) {
    return {
      content: `[Binary file: ${file.name} (${contentType}), skipped]`,
      filename: file.name,
    };
  }

  const content = await res.text();
  return { content, filename: file.name };
}

/**
 * Upload a file to a Slack channel/DM thread.
 * Uses the 3-step upload flow. Returns true on success, false on failure.
 */
export async function uploadFile(
  token: string,
  channelId: string,
  filename: string,
  content: string,
  threadTs?: string,
): Promise<boolean> {
  try {
    const contentBytes = new TextEncoder().encode(content);

    // Step 1: Get upload URL (this endpoint requires form-urlencoded, not JSON)
    const params = new URLSearchParams();
    params.set('filename', filename);
    params.set('length', String(contentBytes.length));

    const step1Res = await fetch('https://slack.com/api/files.getUploadURLExternal', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    if (step1Res.status === 429) {
      const retryAfter = parseInt(step1Res.headers.get('Retry-After') || '5', 10);
      await sleep(retryAfter * 1000);
      return uploadFile(token, channelId, filename, content, threadTs);
    }

    const uploadData = (await step1Res.json()) as SlackApiResponse & {
      upload_url: string;
      file_id: string;
    };
    if (!uploadData.ok) {
      throw new Error(`Slack API files.getUploadURLExternal: ${uploadData.error}`);
    }

    // Step 2: Upload content to the URL
    const uploadRes = await fetch(uploadData.upload_url, {
      method: 'POST',
      body: contentBytes,
      headers: { 'Content-Type': 'application/octet-stream' },
    });

    if (!uploadRes.ok) {
      console.error(`File upload step 2 failed: HTTP ${uploadRes.status}`);
      return false;
    }

    // Step 3: Complete upload and share to channel
    const completeBody: Record<string, unknown> = {
      files: [{ id: uploadData.file_id }],
      channel_id: channelId,
    };
    if (threadTs) {
      completeBody.thread_ts = threadTs;
    }

    await slackApi(token, 'POST', 'files.completeUploadExternal', completeBody);
    return true;
  } catch (err) {
    console.error(`File upload failed: ${(err as Error).message}`);
    return false;
  }
}
