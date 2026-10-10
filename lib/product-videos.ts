export function normalizeVideoUrls(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const urls: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    const url = typeof item === "string" ? item.trim() : "";
    if (!url || seen.has(url)) continue;
    seen.add(url);
    urls.push(url);
  }
  return urls;
}

export function productVideoUrls(product: {
  videoUrl?: string | null;
  videos?: { url: string }[] | null;
}): string[] {
  const fromRows = (product.videos ?? [])
    .map((video) => video.url.trim())
    .filter(Boolean);
  if (fromRows.length > 0) return fromRows;
  const single = product.videoUrl?.trim();
  return single ? [single] : [];
}
