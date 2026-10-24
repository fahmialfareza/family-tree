/** Only same-site paths survive (no scheme, host, backslash, or whitespace/control tricks). */
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.length > 512) return fallback;
  for (const ch of next) {
    const code = ch.charCodeAt(0);
    if (code <= 0x20 || code === 0x7f || ch === "\\") return fallback;
  }
  return next;
}
