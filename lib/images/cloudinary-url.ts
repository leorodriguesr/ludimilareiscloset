/** Redimensiona na CDN do Cloudinary; outras URLs passam intactas. */

export function cloudinaryImageUrl(
  url: string,
  width: number
): string {
  if (!url || width <= 0) return url;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes("cloudinary.com")) return url;
    const marker = "/image/upload/";
    const index = parsed.pathname.indexOf(marker);
    if (index === -1) return url;
    const rest = parsed.pathname.slice(index + marker.length);
    const transform = `f_auto,q_auto:good,c_limit,w_${Math.round(width)}`;
    if (rest.startsWith(`${transform}/`)) return url;
    parsed.pathname = `${parsed.pathname.slice(0, index + marker.length)}${transform}/${rest}`;
    return parsed.toString();
  } catch {
    return url;
  }
}
