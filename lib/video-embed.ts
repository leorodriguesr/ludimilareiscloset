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

/** URL do iframe para a vitrine: sem controles, logo ou sugestões, em loop. */
export function playbackEmbedUrl(info: VideoEmbedInfo): string | null {
  if (!info.embedUrl) return null;
  const embed = new URL(info.embedUrl);

  if (info.provider === "youtube") {
    const videoId = embed.pathname.split("/").filter(Boolean).pop() ?? "";
    embed.searchParams.set("autoplay", "1");
    embed.searchParams.set("mute", "1");
    embed.searchParams.set("controls", "0");
    embed.searchParams.set("modestbranding", "1");
    embed.searchParams.set("rel", "0");
    embed.searchParams.set("iv_load_policy", "3");
    embed.searchParams.set("fs", "0");
    embed.searchParams.set("disablekb", "1");
    embed.searchParams.set("playsinline", "1");
    embed.searchParams.set("cc_load_policy", "0");
    embed.searchParams.set("loop", "1");
    if (videoId) embed.searchParams.set("playlist", videoId);
  }

  if (info.provider === "vimeo") {
    embed.searchParams.set("autoplay", "1");
    embed.searchParams.set("muted", "1");
    embed.searchParams.set("background", "1");
    embed.searchParams.set("loop", "1");
    embed.searchParams.set("autopause", "0");
    embed.searchParams.set("title", "0");
    embed.searchParams.set("byline", "0");
    embed.searchParams.set("portrait", "0");
  }

  return embed.toString();
}
