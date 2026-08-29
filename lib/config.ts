/**
 * Central place for every environment variable the engine reads.
 * Keeping the lookups here means a missing variable fails with a clear message
 * instead of an undefined value travelling deep into a request.
 */

function required(name: string): string {
  const value = process.env[name];
  if (!value || value.trim() === '') {
    throw new Error(
      `Missing environment variable ${name}. Copy .env.example to .env.local and fill it in.`,
    );
  }
  return value.trim();
}

function optional(name: string, fallback: string): string {
  const value = process.env[name];
  return value && value.trim() !== '' ? value.trim() : fallback;
}

export const config = {
  get geminiApiKey() {
    return required('GEMINI_API_KEY');
  },
  get geminiModel() {
    return optional('GEMINI_MODEL', 'gemini-2.5-flash');
  },
  /**
   * Where the Gemini calls go. Empty means Google's own endpoint, which is
   * what production uses. Set it to send them through a proxy, or at a stub
   * while testing the pipeline without spending a request.
   */
  get geminiBaseUrl() {
    return optional('GEMINI_BASE_URL', '');
  },
  /**
   * Explicit Chromium binary. Empty means "discover one", which lib/chromium.ts
   * does by looking through Playwright's downloads and the usual Chrome, Chromium
   * and Edge locations. The Docker image sets this to /usr/bin/chromium.
   */
  get chromiumPath() {
    return optional('PDF_CHROMIUM_PATH', '');
  },
  get pocketbaseUrl() {
    return optional('POCKETBASE_URL', 'http://pocketbase:8090').replace(/\/$/, '');
  },
  get pocketbaseAdminEmail() {
    return optional('POCKETBASE_ADMIN_EMAIL', '');
  },
  get pocketbaseAdminPassword() {
    return optional('POCKETBASE_ADMIN_PASSWORD', '');
  },
  /** Max upload size for a .zip archive, in megabytes. */
  get maxUploadMb() {
    return Number(optional('MAX_UPLOAD_MB', '50'));
  },

  /**
   * Committing a generated slide design back to the repository. Needs only
   * `contents: write` on the one repo — no other scope is used.
   */
  get githubToken() {
    return required('GITHUB_TOKEN');
  },
  get githubRepo() {
    return required('GITHUB_REPO');
  },
  get githubBranch() {
    return optional('GITHUB_BRANCH', 'claude/linkedin-carousel-generator-gg73ng');
  },

  /**
   * Publishing, analytics and the comment inbox, through a self-hosted Postiz.
   * Read but not yet used: the routes that will call it are not built, and an
   * empty value here is what the health check reports as "not connected".
   */
  get postizUrl() {
    return optional('POSTIZ_URL', '').replace(/\/$/, '');
  },
  get postizApiKey() {
    return optional('POSTIZ_API_KEY', '');
  },
  /** Where a hosted prompt's share link points. */
  get publicBaseUrl() {
    return optional('PUBLIC_BASE_URL', '').replace(/\/$/, '');
  },
};

/**
 * Used by the dashboard health strip so the user can see what is not configured
 * yet without digging through server logs.
 */
export function environmentReport() {
  return [
    { key: 'GEMINI_API_KEY', set: Boolean(process.env.GEMINI_API_KEY), required: true },
    { key: 'GEMINI_MODEL', set: Boolean(process.env.GEMINI_MODEL), required: false },
    { key: 'PDF_CHROMIUM_PATH', set: Boolean(process.env.PDF_CHROMIUM_PATH), required: false },
    { key: 'POCKETBASE_URL', set: Boolean(process.env.POCKETBASE_URL), required: false },
    {
      key: 'POCKETBASE_ADMIN_EMAIL',
      set: Boolean(process.env.POCKETBASE_ADMIN_EMAIL),
      required: false,
    },
    {
      key: 'POCKETBASE_ADMIN_PASSWORD',
      set: Boolean(process.env.POCKETBASE_ADMIN_PASSWORD),
      required: false,
    },
    { key: 'GITHUB_TOKEN', set: Boolean(process.env.GITHUB_TOKEN), required: false },
    { key: 'GITHUB_REPO', set: Boolean(process.env.GITHUB_REPO), required: false },
    { key: 'GITHUB_BRANCH', set: Boolean(process.env.GITHUB_BRANCH), required: false },
    { key: 'POSTIZ_URL', set: Boolean(process.env.POSTIZ_URL), required: false },
    { key: 'POSTIZ_API_KEY', set: Boolean(process.env.POSTIZ_API_KEY), required: false },
    { key: 'PUBLIC_BASE_URL', set: Boolean(process.env.PUBLIC_BASE_URL), required: false },
  ];
}
