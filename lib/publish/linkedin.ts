import { config } from '../config';
import { describeFailure, PublishError, type PublishOutcome, type PublishRequest } from './types';

/**
 * Posts to a LinkedIn personal profile.
 *
 * Personal only, deliberately. Posting as a company page needs the
 * `w_organization_social` scope, which is behind LinkedIn's Community
 * Management review; the personal `w_member_social` scope is self-serve and
 * free. The company page is posted by hand, which is why nothing here takes an
 * organization URN.
 *
 * A carousel is a *document* on LinkedIn, not a set of images: the PDF is
 * uploaded and LinkedIn draws the pager itself. A single image goes through
 * the images endpoint instead. Both are two calls — register an upload, PUT
 * the bytes — followed by the post itself.
 */

function headers(token: string): Record<string, string> {
  return {
    Authorization: `Bearer ${token}`,
    'LinkedIn-Version': config.linkedinVersion,
    'X-Restli-Protocol-Version': '2.0.0',
    'Content-Type': 'application/json',
  };
}

/** Registers an upload and PUTs the bytes. Returns the asset URN. */
async function upload(
  kind: 'images' | 'documents',
  owner: string,
  token: string,
  bytes: Buffer,
  contentType: string,
): Promise<string> {
  const init = await fetch(`${config.linkedinApiBase}/${kind}?action=initializeUpload`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({ initializeUploadRequest: { owner } }),
  });
  if (!init.ok) throw await describeFailure('LinkedIn', init);

  const registered = (await init.json()) as {
    value?: { uploadUrl?: string; image?: string; document?: string };
  };
  const uploadUrl = registered.value?.uploadUrl;
  const urn = registered.value?.image ?? registered.value?.document;

  if (!uploadUrl || !urn) {
    throw new PublishError('LinkedIn accepted the upload request but returned no upload URL.');
  }

  const sent = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body: new Uint8Array(bytes),
  });
  if (!sent.ok) throw await describeFailure('LinkedIn', sent);

  return urn;
}

export async function publishToLinkedIn(request: PublishRequest): Promise<PublishOutcome> {
  const { connection, caption } = request;
  const token = connection.access_token;

  if (!token) throw new PublishError('No LinkedIn access token is stored for that account.');
  if (!connection.account_id) {
    throw new PublishError('No LinkedIn member id is stored for that account.');
  }

  // The stored id may be the bare `sub` from /v2/userinfo or a full URN.
  const author = connection.account_id.startsWith('urn:')
    ? connection.account_id
    : `urn:li:person:${connection.account_id}`;

  let media: Record<string, unknown>;

  if (request.type === 'carousel') {
    if (!request.pdf) throw new PublishError('This post has no rendered PDF to publish.');
    const urn = await upload('documents', author, token, request.pdf, 'application/pdf');
    media = { media: { id: urn, title: request.title.slice(0, 100) } };
  } else {
    const first = request.images[0];
    if (!first) throw new PublishError('This post has no rendered slide to publish.');
    const urn = await upload('images', author, token, first, 'image/jpeg');
    media = { media: { id: urn, altText: request.title.slice(0, 350) } };
  }

  const response = await fetch(`${config.linkedinApiBase}/posts`, {
    method: 'POST',
    headers: headers(token),
    body: JSON.stringify({
      author,
      commentary: caption,
      visibility: 'PUBLIC',
      distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
      content: media,
      lifecycleState: 'PUBLISHED',
      isReshareDisabledByAuthor: false,
    }),
  });

  if (!response.ok) throw await describeFailure('LinkedIn', response);

  // LinkedIn returns the new post's URN in a header, not in the body.
  const urn = response.headers.get('x-restli-id') ?? '';
  return {
    remoteId: urn,
    postUrl: urn ? `https://www.linkedin.com/feed/update/${urn}/` : '',
  };
}
