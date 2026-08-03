import { getMelhorEnvioAccessToken } from "@/lib/shipping/melhor-envio/auth";
import {
  melhorEnvioApiOrigin,
  melhorEnvioUserAgent,
  resolveMelhorEnvioTarget,
} from "@/lib/shipping/melhor-envio/env";
import { ShippingQuoteError } from "@/lib/shipping/types";

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

function extractUpstreamMessage(json: unknown, text: string): string {
  const obj = asRecord(json);
  if (!obj) return text || "Erro no Melhor Envio.";

  const errors = obj.errors;
  if (errors && typeof errors === "object" && !Array.isArray(errors)) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(errors as Record<string, unknown>)) {
      if (Array.isArray(value)) {
        parts.push(`${key}: ${value.map(String).join(", ")}`);
      } else if (value != null) {
        parts.push(`${key}: ${String(value)}`);
      }
    }
    if (parts.length) return parts.join("; ");
  }

  const nestedError = asRecord(obj.error);
  if (nestedError) {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(nestedError)) {
      if (Array.isArray(value)) {
        parts.push(`${key}: ${value.flat().map(String).join(", ")}`);
      } else if (value != null) {
        parts.push(`${key}: ${String(value)}`);
      }
    }
    if (parts.length) return parts.join("; ");
  }

  const msg = obj.message ?? obj.error ?? obj.msg;
  if (msg != null && String(msg).trim()) return String(msg);
  return text || "Erro no Melhor Envio.";
}

export async function melhorEnvioRequest(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  options?: { retryOnAuth?: boolean }
): Promise<unknown> {
  const target = resolveMelhorEnvioTarget();
  const apiOrigin = melhorEnvioApiOrigin(target);
  const userAgent = melhorEnvioUserAgent();
  const retryOnAuth = options?.retryOnAuth !== false;

  let accessToken = await getMelhorEnvioAccessToken();

  const doFetch = async (token: string) => {
    if (process.env.NODE_ENV === "development") {
      console.debug(`[MelhorEnvio] ${method} ${path} (${target})`);
    }
    return fetch(`${apiOrigin}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        "User-Agent": userAgent,
        Accept: "application/json",
        ...(body != null ? { "Content-Type": "application/json" } : {}),
      },
      ...(body != null ? { body: JSON.stringify(body) } : {}),
      cache: "no-store",
    });
  };

  let res = await doFetch(accessToken);
  if (res.status === 401 && retryOnAuth) {
    accessToken = await getMelhorEnvioAccessToken({ forceRefresh: true });
    res = await doFetch(accessToken);
  }

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    const msg = extractUpstreamMessage(json, text);
    console.error(`[MelhorEnvio] ${method} ${path} HTTP ${res.status}:`, msg, json);
    throw new ShippingQuoteError(
      "UPSTREAM",
      msg || "Erro no Melhor Envio.",
      res.status,
      json
    );
  }

  return json;
}

export function meAsRecord(v: unknown): Record<string, unknown> | null {
  return asRecord(v);
}

export function meNum(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
