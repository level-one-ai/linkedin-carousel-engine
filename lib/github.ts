import { config } from './config';

/**
 * Writes a generated slide design back into the repository.
 *
 * A design that only ever lives in PocketBase is not in git history, is not
 * reviewable, and is lost with the database. Committing it to `templates/`
 * makes it the same kind of object as the six that shipped: a file, in the
 * repo, that the app reads from disk.
 *
 * The commit does not make it usable — the running container has the templates
 * it was built with — but PocketBase covers that half. The commit is what
 * makes it permanent.
 *
 * Uses the Contents API rather than the git plumbing: two files, one at a
 * time, no tree to build.
 */

const API = 'https://api.github.com';

interface ContentsResponse {
  sha?: string;
  content?: string;
  message?: string;
}

async function call(path: string, init?: RequestInit): Promise<ContentsResponse> {
  const response = await fetch(`${API}${path}`, {
    ...init,
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${config.githubToken}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
      ...init?.headers,
    },
  });

  const body = (await response.json().catch(() => ({}))) as ContentsResponse;

  if (!response.ok && response.status !== 404) {
    throw new Error(
      `GitHub said ${response.status}: ${body.message ?? 'no reason given'}. ` +
        'Check GITHUB_TOKEN has contents write access to GITHUB_REPO.',
    );
  }

  return response.status === 404 ? {} : body;
}

/** The current contents of a file, or null when it is not there yet. */
export async function readFile(path: string): Promise<{ text: string; sha: string } | null> {
  const repo = config.githubRepo;
  const branch = encodeURIComponent(config.githubBranch);
  const result = await call(`/repos/${repo}/contents/${path}?ref=${branch}`);

  if (!result.content || !result.sha) return null;

  return {
    text: Buffer.from(result.content, 'base64').toString('utf8'),
    sha: result.sha,
  };
}

/**
 * Creates or replaces one file.
 *
 * `sha` is what makes this a replace rather than a create, and GitHub refuses
 * an update without it — which is also the concurrency check: if someone else
 * changed the file since it was read, the write is rejected rather than
 * silently overwriting them.
 */
export async function writeFile(args: {
  path: string;
  content: string;
  message: string;
  sha?: string;
}): Promise<void> {
  await call(`/repos/${config.githubRepo}/contents/${args.path}`, {
    method: 'PUT',
    body: JSON.stringify({
      message: args.message,
      content: Buffer.from(args.content, 'utf8').toString('base64'),
      branch: config.githubBranch,
      ...(args.sha ? { sha: args.sha } : {}),
    }),
  });
}

export function githubConfigured(): boolean {
  return Boolean(process.env.GITHUB_TOKEN && process.env.GITHUB_REPO);
}
