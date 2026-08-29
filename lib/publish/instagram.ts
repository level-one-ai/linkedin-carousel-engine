import { config } from '../config';
import { describeFailure, PublishError, type PublishOutcome, type PublishRequest } from './types';

/**
 * Posts to an Instagram professional account.
 *
 * Instagram publishes in two moves whatever the post is: a container is
 * created from a picture URL, then that container is published. A carousel
 * adds a third — one container per slide, then a container of containers.
 *
 * Like Facebook, Instagram fetches the picture, so PUBLIC_BASE_URL has to be
 * reachable from the internet. Instagram also caps a carousel at ten slides,
 * which an eight-slide blueprint stays inside.
 */

const MAX_SLIDES = 10;

function graph(path: string): string {
  return `${config.metaGraphBase}/${config.metaGraphVersion}/${path}`;
}

async function createContainer(
  user: string,
  token: string,
  body: Record<string, unknown>,
): Promise<string> {
  const response = await fetch(graph(`${user}/media`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ...body, access_token: token }),
  });
  if (!response.ok) throw await describeFailure('Instagram', response);

  const created = (await response.json()) as { id?: string };
  if (!created.id) throw new PublishError('Instagram accepted the picture but returned no id.');
  return created.id;
}

export async function publishToInstagram(request: PublishRequest): Promise<PublishOutcome> {
  const { connection, caption, imageUrls } = request;
  const token = connection.access_token;
  const user = connection.account_id;

  if (!token) throw new PublishError('No Instagram access token is stored for that account.');
  if (!user) throw new PublishError('No Instagram user id is stored for that account.');
  if (imageUrls.length === 0) throw new PublishError('This post has no slides to publish.');

  let container: string;

  if (request.type === 'image' || imageUrls.length === 1) {
    container = await createContainer(user, token, { image_url: imageUrls[0], caption });
  } else {
    const children: string[] = [];
    for (const url of imageUrls.slice(0, MAX_SLIDES)) {
      children.push(await createContainer(user, token, { image_url: url, is_carousel_item: true }));
    }
    container = await createContainer(user, token, {
      media_type: 'CAROUSEL',
      children,
      caption,
    });
  }

  const response = await fetch(graph(`${user}/media_publish`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ creation_id: container, access_token: token }),
  });
  if (!response.ok) throw await describeFailure('Instagram', response);

  const published = (await response.json()) as { id?: string };
  const id = published.id ?? '';
  return { remoteId: id, postUrl: id ? `https://www.instagram.com/p/${id}/` : '' };
}
