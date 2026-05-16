/**
 * Slugify utility — Phase 5 §1.7
 * Converts a user prompt into a URL/branch-safe slug.
 * Used by push.ts for branch naming: ai/<chatId-short>-<slug>.
 */

/**
 * Convert an arbitrary string into a lowercase, hyphenated slug.
 * Trims to maxLen characters AFTER slugification to keep branch names short.
 *
 * @example
 *   slugify("Add email field + validate on backend!")
 *   // => "add-email-field-validate-on-backend"
 */
export function slugify(text: string, maxLen = 50): string {
  return text
    .toLowerCase()
    .replace(/[àáâãäå]/g, 'a')
    .replace(/[èéêë]/g, 'e')
    .replace(/[ìíîï]/g, 'i')
    .replace(/[òóôõö]/g, 'o')
    .replace(/[ùúûü]/g, 'u')
    .replace(/[ñ]/g, 'n')
    .replace(/[ç]/g, 'c')
    // Replace any non-alphanumeric chars (spaces, punctuation, unicode) with hyphens
    .replace(/[^a-z0-9]+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '')
    // Collapse consecutive hyphens
    .replace(/-{2,}/g, '-')
    .slice(0, maxLen)
    // Remove trailing hyphen after slice
    .replace(/-+$/, '');
}
