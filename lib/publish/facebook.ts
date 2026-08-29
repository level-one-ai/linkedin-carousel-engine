import { config } from '../config';
import { describeFailure, PublishError, type PublishOutcome, type PublishRequest } from './types';

/**
 * Posts to a Facebook Page.
 *
 * Facebook fetches the pictures rather than accepting an upload, so this needs
 * PUBLIC_BASE_URL to be an address Facebook's servers can reach — a link to
 * localhost publishes nothing and says very little about why.
 *
 * A multi-picture post is made in two steps: each photo is uploaded unpublished
 * so it does not appear on its own in the feed, then one feed post attaches
 * them all. A single image is one call, because a photo post carries its own
 * caption.
 */

function graph(path: string): string {
  return `${config.metaGraphBase}/${config.metaGraphVersion}/${path}`;
}

export async function publishToFacebook(request: PublishRequest): Promise<PublishOutcome> {
  const { connection, caption, imageUrls } = request;
  const token = connection.access_token;
  const page = connection.account_id;

  if (!token) throw new PublishError('No Facebook Page access token is stored for that account.');
  if (!page) throw new PublishError('No Facebook Page id is stored for that account.');
  if (imageUrls.length === 0) throw new PublishError('This post has no slides to publish.');

  if (request.type === 'image') {
    const response = await fetch(graph(`${page}/photos`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: imageUrls[0], caption, access_token: token }),
    });
    if (!response.ok) throw await describeFailure('Facebook', response);

    const created = (await response.json()) as { id?: string; post_id?: string };
    const id = created.post_id ?? created.id ?? '';
    return { remoteId: id, postUrl: id ? `https://www.facebook.com/${id}` : '' };
  }

  // Unpublished photos first: published ones would each appear in the feed on
  // their own, and the carousel post would be the ninth thing readers saw.
  const mediaIds: string[] = [];
  for (const url of imageUrls) {
    const response = await fetch(graph(`${page}/photos`), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, published: false, access_token: token }),
    });
    if (!response.ok) throw await describeFailure('Facebook', response);
    const created = (await response.json()) as { id?: string };
    if (!created.id) throw new PublishError('Facebook accepted a slide but returned no id for it.');
    mediaIds.push(created.id);
  }

  const response = await fetch(graph(`${page}/feed`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: caption,
      attached_media: mediaIds.map((id) => ({ media_fbid: id })),
      access_token: token,
    }),
  });
  if (!response.ok) throw await describeFailure('Facebook', response);

  const created = (await response.json()) as { id?: string };
  const id = created.id ?? '';
  return { remoteId: id, postUrl: id ? `https://www.facebook.com/${id}` : '' };
}
