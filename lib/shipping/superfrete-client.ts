import {
  ShippingQuoteError,
  type IdealPackage,
} from "@/lib/shipping/types";
import {
  resolveSuperfreteTarget,
  superfreteApiOriginForTarget,
  superfreteTokenForTarget,
  type SuperfreteTarget,
} from "@/lib/shipping/superfrete-env";

export type { SuperfreteTarget };
export {
  resolveSuperfreteTarget,
  superfreteTargetLabel,
  superfreteWalletUrlForTarget,
} from "@/lib/shipping/superfrete-env";

export type SuperFreteClientConfig = {
  target: SuperfreteTarget;
  token: string;
  apiOrigin: string;
  userAgent: string;
  originPostalCode: string;
};

export function readSuperFreteClientConfig(): SuperFreteClientConfig {
  const target = resolveSuperfreteTarget();
  const token = superfreteTokenForTarget(target);
  if (!token) {
    const varName =
      target === "sandbox" ? "SUPERFRETE_SANDBOX_TOKEN" : "SUPERFRETE_PRODUCTION_TOKEN";
    throw new ShippingQuoteError(
      "CONFIG",
      `${varName} (ou SUPERFRETE_TOKEN) não configurado para ambiente "${target}".`,
      503
    );
  }

  const userAgent =
    process.env.SUPERFRETE_USER_AGENT?.trim() ||
    "LudimilaReisCloset/1.0 (configure SUPERFRETE_USER_AGENT)";

  const originPostalCode = (process.env.SHIPPING_ORIGIN_POSTAL_CODE ?? "").replace(
    /\D/g,
    ""
  );
  if (originPostalCode.length !== 8) {
    throw new ShippingQuoteError(
      "CONFIG",
      "SHIPPING_ORIGIN_POSTAL_CODE inválido.",
      503
    );
  }

  const apiOrigin = superfreteApiOriginForTarget(target);

  return { target, token, apiOrigin, userAgent, originPostalCode };
}

export function readStoreSenderFromEnv() {
  const cfg = readSuperFreteClientConfig();
  return {
    name: process.env.STORE_NAME?.trim() || "Ludimila Reis Closet",
    document: process.env.STORE_DOCUMENT?.trim() || "",
    phone: (process.env.STORE_PHONE ?? "").replace(/\D/g, ""),
    email: process.env.STORE_EMAIL?.trim() || "",
    address: process.env.STORE_ADDRESS?.trim() || "",
    number: process.env.STORE_NUMBER?.trim() || "S/N",
    complement: process.env.STORE_COMPLEMENT?.trim() || "",
    district: process.env.STORE_DISTRICT?.trim() || "NA",
    city: process.env.STORE_CITY?.trim() || "",
    state_abbr: (process.env.STORE_STATE?.trim() || "").toUpperCase(),
    postal_code: cfg.originPostalCode,
    country_id: "BR",
  };
}

function formatSuperfreteServiceError(service: string, code: string): string {
  const known: Record<string, string> = {
    "444":
      "indisponível para esta rota (PAC costuma retornar 444 no sandbox da SuperFrete — use SEDEX ou produção)",
  };
  const hint = known[code];
  return hint ? `${service}: ${hint}` : `${service}: erro ${code}`;
}

function extractUpstreamMessage(json: unknown, text: string): string {
  if (typeof json === "object" && json !== null) {
    const obj = json as Record<string, unknown>;
    const errors = obj.errors;
    if (errors && typeof errors === "object" && !Array.isArray(errors)) {
      const parts: string[] = [];
      for (const [service, codes] of Object.entries(errors as Record<string, unknown>)) {
        const list = Array.isArray(codes) ? codes : [codes];
        for (const code of list) {
          parts.push(formatSuperfreteServiceError(service, String(code)));
        }
      }
      if (parts.length > 0) return parts.join("; ");
    }
    if (Array.isArray(errors) && errors.length > 0) {
      const parts = errors.map((e) => {
        if (typeof e === "string") return e;
        if (e && typeof e === "object") {
          const row = e as Record<string, unknown>;
          return String(row.message ?? row.error ?? row.field ?? JSON.stringify(row));
        }
        return String(e);
      });
      return parts.join("; ");
    }
    const msg = obj.message ?? obj.error ?? obj.msg;
    if (msg != null && String(msg).trim()) return String(msg);
  }
  return text;
}

export async function superfreteRequest(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<unknown> {
  const cfg = readSuperFreteClientConfig();
  if (process.env.NODE_ENV === "development") {
    console.debug(`[SuperFrete] ${method} ${path} (${cfg.target})`);
  }
  const res = await fetch(`${cfg.apiOrigin}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "User-Agent": cfg.userAgent,
      Accept: "application/json",
      ...(body != null ? { "Content-Type": "application/json" } : {}),
    },
    ...(body != null ? { body: JSON.stringify(body) } : {}),
    cache: "no-store",
  });

  const text = await res.text();
  let json: unknown;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    const msg = extractUpstreamMessage(json, text);
    console.error(`[SuperFrete] ${method} ${path} HTTP ${res.status}:`, msg, json);
    throw new ShippingQuoteError(
      "UPSTREAM",
      msg || "Erro na SuperFrete.",
      res.status,
      json
    );
  }

  return json;
}

export function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) {
    return v as Record<string, unknown>;
  }
  return null;
}

export function num(v: unknown): number | null {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

export function extractIdealPackage(raw: unknown): IdealPackage | null {
  const root = asRecord(raw);
  if (!root) return null;

  const candidates = [
    root.package,
    root.volume,
    Array.isArray(root.volumes) ? root.volumes[0] : root.volumes,
  ];

  for (const c of candidates) {
    const pkg = asRecord(c);
    if (!pkg) continue;
    const weightKg = num(pkg.weight);
    const heightCm = num(pkg.height);
    const widthCm = num(pkg.width);
    const lengthCm = num(pkg.length);
    if (
      weightKg != null &&
      heightCm != null &&
      widthCm != null &&
      lengthCm != null
    ) {
      return { weightKg, heightCm, widthCm, lengthCm };
    }
  }

  return null;
}
