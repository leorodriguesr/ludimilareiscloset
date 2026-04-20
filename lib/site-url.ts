/**
 * URL base pública da app (OAuth redirect, links absolutos).
 * Defina `NEXT_PUBLIC_SITE_URL` em produção (ex.: https://seudominio.com).
 */
export function getAppBaseUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "");
  if (explicit) return explicit;
  if (process.env.VERCEL_URL)
    return `https://${process.env.VERCEL_URL.replace(/\/$/, "")}`;
  return "http://localhost:3000";
}
