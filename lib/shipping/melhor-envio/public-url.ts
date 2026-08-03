import type { NextRequest } from "next/server";

/**
 * Origem pública da app para redirects pós-OAuth.
 * Com ngrok, `request.url` costuma vir como localhost e quebrar o redirect.
 */
export function resolveMelhorEnvioPublicOrigin(request: NextRequest): string {
  const redirectUri = process.env.MELHOR_ENVIO_REDIRECT_URI?.trim();
  if (redirectUri) {
    try {
      return new URL(redirectUri).origin;
    } catch {
      /* ignore */
    }
  }

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    try {
      return new URL(site).origin;
    } catch {
      /* ignore */
    }
  }

  const proto =
    request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
  const host =
    request.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
    request.headers.get("host")?.trim();
  if (host) return `${proto}://${host}`;

  return new URL(request.url).origin;
}
