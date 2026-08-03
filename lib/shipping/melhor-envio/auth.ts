import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { ShippingQuoteError } from "@/lib/shipping/types";
import {
  MELHOR_ENVIO_SCOPES,
  melhorEnvioApiOrigin,
  readMelhorEnvioAppConfig,
} from "@/lib/shipping/melhor-envio/env";
import {
  decryptSecret,
  encryptSecret,
} from "@/lib/shipping/melhor-envio/crypto";

const AUTH_ID = "default";
const STATE_TTL_MS = 15 * 60 * 1000;
const REFRESH_SKEW_MS = 5 * 60 * 1000;

type TokenResponse = {
  token_type?: string;
  expires_in?: number;
  access_token?: string;
  refresh_token?: string;
};

let refreshInFlight: Promise<string> | null = null;

function requireAppConfig() {
  const cfg = readMelhorEnvioAppConfig();
  if (!cfg) {
    throw new ShippingQuoteError(
      "CONFIG",
      "Melhor Envio não configurado. Defina MELHOR_ENVIO_CLIENT_ID, MELHOR_ENVIO_CLIENT_SECRET e MELHOR_ENVIO_REDIRECT_URI.",
      503
    );
  }
  return cfg;
}

export function buildMelhorEnvioAuthorizeUrl(state: string): string {
  const cfg = requireAppConfig();
  const url = new URL(`${cfg.apiOrigin}/oauth/authorize`);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  url.searchParams.set("scope", MELHOR_ENVIO_SCOPES);
  return url.toString();
}

export async function createMelhorEnvioOAuthState(): Promise<string> {
  const state = randomBytes(24).toString("hex");
  const expiresAt = new Date(Date.now() + STATE_TTL_MS);
  await prisma.melhorEnvioOAuthState.create({
    data: { state, expiresAt },
  });
  // Limpeza best-effort de states expirados
  await prisma.melhorEnvioOAuthState
    .deleteMany({ where: { expiresAt: { lt: new Date() } } })
    .catch(() => undefined);
  return state;
}

export async function consumeMelhorEnvioOAuthState(
  state: string
): Promise<boolean> {
  const row = await prisma.melhorEnvioOAuthState.findUnique({
    where: { state },
  });
  if (!row || row.expiresAt.getTime() < Date.now()) {
    if (row) {
      await prisma.melhorEnvioOAuthState
        .delete({ where: { state } })
        .catch(() => undefined);
    }
    return false;
  }
  await prisma.melhorEnvioOAuthState.delete({ where: { state } });
  return true;
}

async function exchangeToken(body: Record<string, string>): Promise<{
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
}> {
  const cfg = requireAppConfig();
  const res = await fetch(`${cfg.apiOrigin}/oauth/token`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "User-Agent": cfg.userAgent,
    },
    body: JSON.stringify(body),
    cache: "no-store",
  });

  const json = (await res.json().catch(() => null)) as TokenResponse | null;
  if (!res.ok || !json?.access_token || !json?.refresh_token) {
    const msg =
      (json as { message?: string } | null)?.message ||
      (json as { error_description?: string } | null)?.error_description ||
      "Falha na autenticação Melhor Envio.";
    throw new ShippingQuoteError("UPSTREAM", msg, res.status || 502, json);
  }

  const expiresIn = Number(json.expires_in) || 2_592_000;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresAt: new Date(Date.now() + expiresIn * 1000),
  };
}

export async function completeMelhorEnvioOAuth(code: string): Promise<void> {
  const cfg = requireAppConfig();
  const tokens = await exchangeToken({
    grant_type: "authorization_code",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    code,
  });

  await prisma.melhorEnvioAuth.upsert({
    where: { id: AUTH_ID },
    create: {
      id: AUTH_ID,
      accessTokenEncrypted: encryptSecret(tokens.accessToken),
      refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scope: MELHOR_ENVIO_SCOPES,
      connectedAt: new Date(),
    },
    update: {
      accessTokenEncrypted: encryptSecret(tokens.accessToken),
      refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
      scope: MELHOR_ENVIO_SCOPES,
      connectedAt: new Date(),
    },
  });
}

async function refreshAccessToken(): Promise<string> {
  const cfg = requireAppConfig();
  const row = await prisma.melhorEnvioAuth.findUnique({
    where: { id: AUTH_ID },
  });
  if (!row) {
    throw new ShippingQuoteError(
      "CONFIG",
      "Conta Melhor Envio não autorizada. Conecte no admin.",
      503
    );
  }

  const refreshToken = decryptSecret(row.refreshTokenEncrypted);
  const tokens = await exchangeToken({
    grant_type: "refresh_token",
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    refresh_token: refreshToken,
  });

  await prisma.melhorEnvioAuth.update({
    where: { id: AUTH_ID },
    data: {
      accessTokenEncrypted: encryptSecret(tokens.accessToken),
      refreshTokenEncrypted: encryptSecret(tokens.refreshToken),
      expiresAt: tokens.expiresAt,
    },
  });

  return tokens.accessToken;
}

export async function getMelhorEnvioAccessToken(
  options?: { forceRefresh?: boolean }
): Promise<string> {
  const row = await prisma.melhorEnvioAuth.findUnique({
    where: { id: AUTH_ID },
  });
  if (!row) {
    throw new ShippingQuoteError(
      "CONFIG",
      "Conta Melhor Envio não autorizada. Conecte no admin.",
      503
    );
  }

  const stillValid =
    !options?.forceRefresh &&
    row.expiresAt.getTime() - REFRESH_SKEW_MS > Date.now();

  if (stillValid) {
    return decryptSecret(row.accessTokenEncrypted);
  }

  if (!refreshInFlight) {
    refreshInFlight = refreshAccessToken().finally(() => {
      refreshInFlight = null;
    });
  }
  return refreshInFlight;
}

export async function disconnectMelhorEnvio(): Promise<void> {
  await prisma.melhorEnvioAuth.deleteMany({ where: { id: AUTH_ID } });
}

export async function getMelhorEnvioConnectionStatus() {
  const cfg = readMelhorEnvioAppConfig();
  const row = await prisma.melhorEnvioAuth.findUnique({
    where: { id: AUTH_ID },
    select: { expiresAt: true, connectedAt: true, scope: true },
  });
  return {
    configured: Boolean(cfg),
    connected: Boolean(row),
    expiresAt: row?.expiresAt?.toISOString() ?? null,
    connectedAt: row?.connectedAt?.toISOString() ?? null,
    scope: row?.scope ?? null,
    target: cfg?.target ?? null,
    apiOrigin: cfg ? melhorEnvioApiOrigin(cfg.target) : null,
    redirectUri: cfg?.redirectUri ?? null,
  };
}
