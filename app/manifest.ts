import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ludimila Reis Closet",
    short_name: "LR Closet",
    description:
      "Painel e loja Ludimila Reis Closet — moda feminina e gestão de vendas.",
    start_url: "/admin",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#ffffff",
    theme_color: "#1c1917",
    lang: "pt-BR",
    categories: ["shopping", "business"],
    icons: [
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Painel Admin",
        short_name: "Admin",
        description: "Abrir o painel administrativo",
        url: "/admin",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
      {
        name: "Loja",
        short_name: "Loja",
        description: "Abrir a vitrine da loja",
        url: "/",
        icons: [{ src: "/icon-192.png", sizes: "192x192" }],
      },
    ],
  };
}
