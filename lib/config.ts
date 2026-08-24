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
  get gotenbergUrl() {
    return optional('GOTENBERG_URL', 'http://gotenberg:3000').replace(/\/$/, '');
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
};

/**
 * Used by the dashboard health strip so the user can see what is not configured
 * yet without digging through server logs.
 */
export function environmentReport() {
  return [
    { key: 'GEMINI_API_KEY', set: Boolean(process.env.GEMINI_API_KEY), required: true },
    { key: 'GEMINI_MODEL', set: Boolean(process.env.GEMINI_MODEL), required: false },
    { key: 'GOTENBERG_URL', set: Boolean(process.env.GOTENBERG_URL), required: false },
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
  ];
}
