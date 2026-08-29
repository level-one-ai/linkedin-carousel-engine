import { COLLECTIONS, requireAdmin } from './pocketbase';
import type { AccountType, Platform } from './platforms';

/**
 * The accounts a post can be sent to, and the record of what was sent.
 *
 * Tokens live in PocketBase rather than in environment variables because they
 * expire and get refreshed, and a value that changes at runtime does not
 * belong in a file that needs a redeploy to change. The collection is locked
 * to the server — every API rule is null — so none of this is reachable from
 * the browser, and nothing here is ever returned to it.
 */
export interface Connection {
  id: string;
  platform: Platform;
  account_type: AccountType;
  display_name: string;
  /** The person URN, Page id or Instagram user id, depending on the network. */
  account_id: string;
  access_token: string;
  refresh_token: string;
  token_expires: string;
  active: boolean;
}

/** Everything the browser is allowed to know about a connection. */
export interface ConnectionSummary {
  id: string;
  platform: Platform;
  account_type: AccountType;
  display_name: string;
  /** True when a token is stored at all — never the token itself. */
  connected: boolean;
  /** True when the stored token has an expiry that has already passed. */
  expired: boolean;
}

function toConnection(record: Record<string, unknown>): Connection {
  return {
    id: String(record.id ?? ''),
    platform: record.platform as Platform,
    account_type: (record.account_type as AccountType) ?? 'personal',
    display_name: String(record.display_name ?? ''),
    account_id: String(record.account_id ?? ''),
    access_token: String(record.access_token ?? ''),
    refresh_token: String(record.refresh_token ?? ''),
    token_expires: String(record.token_expires ?? ''),
    active: Boolean(record.active),
  };
}

export function summarise(connection: Connection): ConnectionSummary {
  const expires = connection.token_expires ? Date.parse(connection.token_expires) : NaN;
  return {
    id: connection.id,
    platform: connection.platform,
    account_type: connection.account_type,
    display_name: connection.display_name,
    connected: connection.access_token !== '',
    expired: Number.isFinite(expires) ? expires < Date.now() : false,
  };
}

export async function listConnections(): Promise<Connection[]> {
  const client = await requireAdmin();
  const records = await client.collection(COLLECTIONS.connections).getFullList({
    sort: 'platform',
  });
  return records.map((record) => toConnection(record as unknown as Record<string, unknown>));
}

/**
 * The account one network posts as, for a post of a given account type.
 *
 * An exact match on both wins; a connection for the right network with the
 * wrong account type is used only when there is nothing better, because
 * posting to the wrong account is worse than not posting.
 */
export async function connectionFor(
  platform: Platform,
  accountType: AccountType,
): Promise<Connection | null> {
  const all = (await listConnections()).filter(
    (connection) => connection.platform === platform && connection.active,
  );
  return all.find((c) => c.account_type === accountType) ?? all[0] ?? null;
}

export type PublishStatus = 'sent' | 'failed';

/**
 * Records what happened, one row per platform per post.
 *
 * A retry updates the existing row rather than adding a second, so the table
 * answers "where has this post gone" rather than "what have I tried".
 */
export async function recordPublication(entry: {
  postId: string;
  platform: Platform;
  connectionId: string;
  status: PublishStatus;
  remoteId?: string;
  postUrl?: string;
  error?: string;
}): Promise<void> {
  const client = await requireAdmin();
  const data = {
    post: entry.postId,
    platform: entry.platform,
    connection: entry.connectionId,
    status: entry.status,
    remote_id: entry.remoteId ?? '',
    post_url: entry.postUrl ?? '',
    error: (entry.error ?? '').slice(0, 2000),
    sent_at: new Date().toISOString(),
  };

  try {
    const existing = await client
      .collection(COLLECTIONS.publications)
      .getFirstListItem(`post = "${entry.postId}" && platform = "${entry.platform}"`);
    await client.collection(COLLECTIONS.publications).update(existing.id, data);
  } catch {
    await client.collection(COLLECTIONS.publications).create(data);
  }
}

export async function listPublications(postId: string) {
  const client = await requireAdmin();
  return client.collection(COLLECTIONS.publications).getFullList({
    filter: `post = "${postId}"`,
  });
}
