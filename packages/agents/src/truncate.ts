/**
 * Middle-out truncation shared by every place that feeds unbounded text
 * into a prompt: keeps the head and tail (where errors and summaries
 * live), drops the middle, and marks the elision.
 */
export function truncateMiddle(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text;
  const half = Math.floor(maxChars / 2);
  return `${text.slice(0, half)}\n…[truncated ${text.length - maxChars} chars]…\n${text.slice(-half)}`;
}
