import { config } from '../config';
import { connectionFor, recordPublication } from '../connections';
import { getPost, readRender, readSlideImages } from '../pocketbase';
import { PLATFORMS, PLATFORM_SPECS, type Platform } from '../platforms';
import { publishToFacebook } from './facebook';
import { publishToInstagram } from './instagram';
import { publishToLinkedIn } from './linkedin';
import { PublishError, type PublishRequest } from './types';

/**
 * Sends one post to every network that is approved and not skipped.
 *
 * Three things this deliberately does NOT do. It does not post to X, which is
 * pay-per-use and posted by hand. It does not post to a LinkedIn company page,
 * which needs an approval LinkedIn does not hand out for a self-serve app. And
 * it does not stop at the first failure: each network is sent on its own and
 * records its own outcome, because a rejected Instagram caption is no reason
 * for LinkedIn not to go out.
 */

export type PublishState = 'sent' | 'failed' | 'skipped';

export interface PublishReport {
  platform: Platform;
  state: PublishState;
  /** One sentence: where it went, or why it did not. */
  detail: string;
  postUrl?: string;
}

/** Where a network fetches its own pictures from, when it fetches rather than takes an upload. */
function imageUrl(postId: string, design: string, slide: number): string {
  return `${config.publicBaseUrl}/api/posts/${postId}/images?slide=${slide}&design=${encodeURIComponent(design)}`;
}

export async function publishPost(postId: string): Promise<PublishReport[]> {
  const post = await getPost(postId);
  const reports: PublishReport[] = [];

  for (const platform of PLATFORMS) {
    const entry = post.plan[platform];
    const label = PLATFORM_SPECS[platform].label;

    if (entry.type === 'skip') {
      reports.push({ platform, state: 'skipped', detail: `${label} was set to Skip.` });
      continue;
    }
    if (!post.approvals[platform]) {
      reports.push({ platform, state: 'skipped', detail: `${label} is not approved yet.` });
      continue;
    }
    if (platform === 'x') {
      reports.push({
        platform,
        state: 'skipped',
        detail: 'X is posted by hand: its API is pay-per-use, so nothing is sent automatically.',
      });
      continue;
    }

    const accountType = post.accountType === 'business' ? 'business' : 'personal';
    const connection = await connectionFor(platform, accountType);

    if (!connection) {
      const detail = `No ${label} account is connected. Add one to platform_connections.`;
      reports.push({ platform, state: 'failed', detail });
      await recordPublication({ postId, platform, connectionId: '', status: 'failed', error: detail });
      continue;
    }

    if (platform === 'linkedin' && connection.account_type === 'business') {
      const detail =
        'A LinkedIn company page cannot be posted to without Community Management approval, so ' +
        'this one is posted by hand.';
      reports.push({ platform, state: 'skipped', detail });
      continue;
    }

    const design = entry.templateKey || post.chosen_template_key;

    try {
      const stored = await readSlideImages(postId, design);
      const images = entry.type === 'image' ? stored.slice(0, 1) : stored;

      // Meta fetches by URL, so an unreachable origin is worth naming here
      // rather than letting Facebook report it as a picture it could not load.
      const needsUrls = platform === 'facebook' || platform === 'instagram';
      if (needsUrls && !config.publicBaseUrl) {
        throw new PublishError(
          `${label} downloads the pictures itself, so PUBLIC_BASE_URL must be set to an address it can reach.`,
        );
      }

      const request: PublishRequest = {
        connection,
        caption: post.captions[platform],
        type: entry.type,
        images,
        imageUrls: images.map((_, index) => imageUrl(postId, design, index + 1)),
        pdf: platform === 'linkedin' && entry.type === 'carousel' ? await readRender(postId, design) : null,
        title: post.project_title,
      };

      const outcome =
        platform === 'linkedin'
          ? await publishToLinkedIn(request)
          : platform === 'facebook'
            ? await publishToFacebook(request)
            : await publishToInstagram(request);

      await recordPublication({
        postId,
        platform,
        connectionId: connection.id,
        status: 'sent',
        remoteId: outcome.remoteId,
        postUrl: outcome.postUrl,
      });

      reports.push({
        platform,
        state: 'sent',
        detail: `Posted to ${connection.display_name || label}.`,
        postUrl: outcome.postUrl,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : `${label} could not be posted to.`;
      await recordPublication({
        postId,
        platform,
        connectionId: connection.id,
        status: 'failed',
        error: detail,
      });
      reports.push({ platform, state: 'failed', detail });
    }
  }

  return reports;
}
