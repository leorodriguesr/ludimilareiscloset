export type SuperfreteTarget = "sandbox" | "production";

const API_ORIGINS: Record<SuperfreteTarget, string> = {
  sandbox: "https://sandbox.superfrete.com",
  production: "https://api.superfrete.com",
};

const WALLET_URLS: Record<SuperfreteTarget, string> = {
  sandbox: "https://sandbox.superfrete.com/#/account/credits",
  production: "https://web.superfrete.com/#/account/credits",
};

/** Ambiente SuperFrete ativo (sandbox em dev local por padrão). */
export function resolveSuperfreteTarget(): SuperfreteTarget {
  const explicit = process.env.SUPERFRETE_TARGET?.trim().toLowerCase();
  if (explicit === "sandbox" || explicit === "production") return explicit;
  return process.env.NODE_ENV === "production" ? "production" : "sandbox";
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
