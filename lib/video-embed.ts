export type VideoProvider = "youtube" | "vimeo" | "external";

export interface VideoEmbedInfo {
  provider: VideoProvider;
  embedUrl: string | null;
  originalUrl: string;
}

/**
 * Converte URLs comuns (YouTube, Vimeo) em URL de iframe. Outros links viram external.
 */
export function getVideoEmbedInfo(rawUrl: string): VideoEmbedInfo | null {
  const url = rawUrl.trim();
  if (!url) return null;

  try {
    const u = new URL(url);

    if (u.hostname.includes("youtube.com") || u.hostname.includes("youtu.be")) {
      let videoId: string | null = null;
      if (u.hostname.includes("youtu.be")) {
        videoId = u.pathname.replace(/^\//, "").split("/")[0] ?? null;
      } else if (u.pathname.startsWith("/watch")) {
        videoId = u.searchParams.get("v");
      } else if (u.pathname.startsWith("/embed/")) {
        videoId = u.pathname.replace("/embed/", "").split("/")[0] ?? null;
      } else if (u.pathname.startsWith("/shorts/")) {
        videoId = u.pathname.replace("/shorts/", "").split("/")[0] ?? null;
      }
      if (videoId) {
        return {
          provider: "youtube",
          embedUrl: `https://www.youtube-nocookie.com/embed/${videoId}`,
          originalUrl: url,
        };
      }
    }

    if (u.hostname.includes("vimeo.com")) {
      const parts = u.pathname.split("/").filter(Boolean);
      const id = parts[0] === "video" ? parts[1] : parts[0];
      if (id && /^\d+$/.test(id)) {
        return {
          provider: "vimeo",
          embedUrl: `https://player.vimeo.com/video/${id}`,
          originalUrl: url,
        };
      }
    }
  } catch {
    /* URL inválida */
  }

  return {
    provider: "external",
    embedUrl: null,
    originalUrl: url,
  };
}
