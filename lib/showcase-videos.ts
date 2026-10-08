/** Vídeos fixos da vitrine. Para trocar um look, substitua o arquivo em public/videos. */
export const showcaseVideos = [
  { id: "look-01", src: "/videos/look-01.mp4" },
  { id: "look-02", src: "/videos/look-02.mp4" },
  { id: "look-03", src: "/videos/look-03.mp4" },
  { id: "look-04", src: "/videos/look-04.mp4" },
  { id: "look-05", src: "/videos/look-05.mp4" },
] as const;

export type ShowcaseVideoItem = (typeof showcaseVideos)[number];
