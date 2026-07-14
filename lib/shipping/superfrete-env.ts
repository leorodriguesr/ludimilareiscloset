export type SuperfreteTarget = "sandbox" | "production";

const API_ORIGINS: Record<SuperfreteTarget, string> = {
  sandbox: "https://sandbox.superfrete.com",
  production: "https://api.superfrete.com",
};

const WALLET_URLS: Record<SuperfreteTarget, string> = {
  sandbox: "https://sandbox.superfrete.com/#/account/credits",
  production: "https://web.superfrete.com/#/account/credits",
};

function normalizeEnv(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

/**
 * Produção real da loja (não local/staging).
 * Usa DB_TARGET, VERCEL_ENV e APP_ENV — nunca só NODE_ENV,
 * porque `next start` e preview também rodam com NODE_ENV=production.
 */
export function isSuperfreteProductionHost(): boolean {
  const dbTarget = normalizeEnv(process.env.DB_TARGET);
  if (dbTarget === "local" || dbTarget === "staging") return false;
  if (dbTarget === "production") return true;

  const vercelEnv = normalizeEnv(process.env.VERCEL_ENV);
  if (vercelEnv === "preview" || vercelEnv === "development") return false;
  if (vercelEnv === "production") return true;

  const appEnv = normalizeEnv(
    process.env.APP_ENV ?? process.env.NEXT_PUBLIC_APP_ENV
  );
  if (
    appEnv === "staging" ||
    appEnv === "stage" ||
    appEnv === "preview" ||
    appEnv === "development" ||
    appEnv === "dev" ||
    appEnv === "test" ||
    appEnv === "local"
  ) {
    return false;
  }
  if (appEnv === "production" || appEnv === "prod") return true;

  // Local (next dev / next start) e hosts sem sinal claro → não é produção SuperFrete.
  return false;
}

/**
 * Ambiente SuperFrete ativo.
 * Local e staging sempre usam sandbox (mesmo com SUPERFRETE_TARGET=production).
 * Em produção: respeita SUPERFRETE_TARGET; padrão é production.
 */
export function resolveSuperfreteTarget(): SuperfreteTarget {
  if (!isSuperfreteProductionHost()) {
    return "sandbox";
  }

  const explicit = normalizeEnv(process.env.SUPERFRETE_TARGET);
  if (explicit === "sandbox" || explicit === "production") return explicit;
  return "production";
}

export function superfreteApiOriginForTarget(target: SuperfreteTarget): string {
  const override = process.env.SUPERFRETE_API_ORIGIN?.trim();
  if (override) return override.replace(/\/$/, "");
  return API_ORIGINS[target];
}

export function superfreteWalletUrlForTarget(target: SuperfreteTarget): string {
  const custom = process.env.SUPERFRETE_WALLET_URL?.trim();
  if (custom) return custom;
  return WALLET_URLS[target];
}

export function superfreteTokenForTarget(target: SuperfreteTarget): string | null {
  if (target === "sandbox") {
    return (
      process.env.SUPERFRETE_SANDBOX_TOKEN?.trim() ||
      process.env.SUPERFRETE_TOKEN?.trim() ||
      null
    );
  }
  return (
    process.env.SUPERFRETE_PRODUCTION_TOKEN?.trim() ||
    process.env.SUPERFRETE_TOKEN?.trim() ||
    null
  );
}

export function superfreteTargetLabel(target: SuperfreteTarget): string {
  return target === "sandbox" ? "Sandbox (testes)" : "Produção";
}
