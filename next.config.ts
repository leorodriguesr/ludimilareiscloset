import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Permite HMR/assets do Next via túnel ngrok em desenvolvimento.
  allowedDevOrigins: ["ferment-remission-hybrid.ngrok-free.dev"],
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**",
      },
    ],
  },
};

export default nextConfig;
