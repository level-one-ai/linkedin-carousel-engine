/**
 * The zero-emoji rule is stated in the Gemini system prompt, but a prompt is a
 * request and not a guarantee. Every string that reaches a caption, a slide, or
 * the rendered HTML passes through here so the rule holds even if the model slips.
 */

// Unicode property escapes cover pictographs, dingbats, and regional indicators.
const EMOJI_PATTERN =
  /(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[\u{1F1E6}-\u{1F1FF}]|[0-9#*]\u{FE0F}?\u{20E3})/gu;

// Zero-width joiners and variation selectors are left behind once emoji are removed.
const EMOJI_GLUE = /[\u{200D}\u{FE00}-\u{FE0F}\u{E0020}-\u{E007F}]/gu;

export function stripEmojis(input: string): string {
  if (!input) return '';
  return input
    .replace(EMOJI_PATTERN, '')
    .replace(EMOJI_GLUE, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +\n/g, '\n')
    .trim();
}

export function containsEmoji(input: string): boolean {
  EMOJI_PATTERN.lastIndex = 0;
  return EMOJI_PATTERN.test(input);
}

/** Recursively strips emojis from every string inside a plain JSON value. */
export function stripEmojisDeep<T>(value: T): T {
  if (typeof value === 'string') return stripEmojis(value) as unknown as T;
  if (Array.isArray(value)) return value.map((item) => stripEmojisDeep(item)) as unknown as T;
  if (value && typeof value === 'object') {
    const output: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      output[key] = stripEmojisDeep(item);
    }
    return output as unknown as T;
  }
  return value;
}
