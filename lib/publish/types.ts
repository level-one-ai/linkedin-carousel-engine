import type { Connection } from '../connections';
import type { PostType } from '../platforms';

/** What a publisher is handed, whichever network it is. */
export interface PublishRequest {
  connection: Connection;
  caption: string;
  type: PostType;
  /** The slides as bytes, page one first. Used where a network takes uploads. */
  images: Buffer[];
  /**
   * The same slides as URLs on this app's public origin. Used where a network
   * fetches rather than accepts an upload, which is both Meta networks.
   */
  imageUrls: string[];
  /** The rendered PDF, for a real LinkedIn document carousel. */
  pdf: Buffer | null;
  /** Shown as the document title on LinkedIn. */
  title: string;
}

export interface PublishOutcome {
  /** The network's own id for the post. */
  remoteId: string;
  /** A link a human can open, where the network gives one. */
  postUrl: string;
}

/**
 * A failure that already says what went wrong in a sentence.
 *
 * The APIs return their reasons in three different shapes, so each publisher
 * unwraps its own and throws this; the route above then has one thing to
 * write into `post_publications` rather than a stringified object.
 */
export class PublishError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PublishError';
  }
}

/** Reads whatever the API said and turns it into one sentence. */
export async function describeFailure(network: string, response: Response): Promise<PublishError> {
  const body = await response.text();
  let detail = body.slice(0, 400);

  try {
    const parsed = JSON.parse(body) as {
      message?: string;
      error?: { message?: string; error_user_msg?: string } | string;
    };
    if (typeof parsed.error === 'object' && parsed.error) {
      detail = parsed.error.error_user_msg ?? parsed.error.message ?? detail;
    } else if (typeof parsed.error === 'string') {
      detail = parsed.error;
    } else if (parsed.message) {
      detail = parsed.message;
    }
  } catch {
    // Not JSON. The raw text is the best answer available.
  }

  return new PublishError(`${network} refused the post (${response.status}): ${detail}`);
}
