import type { NextRequest } from "next/server";

/**
 * Lê corpo do webhook (JSON ou form-urlencoded) como valor tipado para parse.
 */
export async function readWebhookJsonBody(request: NextRequest): Promise<unknown> {
  const ct = request.headers.get("content-type") ?? "";
  const raw = await request.text();
  if (!raw.trim()) return {};

  if (ct.includes("application/json")) {
    try {
      return JSON.parse(raw) as unknown;
    } catch {
      return null;
    }
  }

  if (ct.includes("application/x-www-form-urlencoded")) {
    const params = new URLSearchParams(raw);
    const obj: Record<string, string> = {};
    params.forEach((value, key) => {
      obj[key] = value;
    });
    return obj;
  }

  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return { _raw: raw.slice(0, 500) };
  }
}
