/** Basic quality checks; the reviewer still assesses whether the explanation is appropriate. */
export function isValidSubmissionReason(reason: string): boolean {
  const text = reason.trim();
  const characters = Array.from(text);
  const compact = text.replace(/\s/gu, "").toLowerCase();
  return characters.length >= 10
    && /\p{L}/u.test(text)
    && new Set(Array.from(compact)).size > 1;
}
