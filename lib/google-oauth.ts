import { getAppBaseUrl } from "@/lib/site-url";

const GOOGLE_AUTH = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN = "https://oauth2.googleapis.com/token";
const GOOGLE_USERINFO = "https://www.googleapis.com/oauth2/v2/userinfo";

export const GOOGLE_OAUTH_STATE_COOKIE = "google_oauth_state";
export const GOOGLE_OAUTH_NEXT_COOKIE = "google_oauth_next";

export function getGoogleRedirectUri(): string {
  return `${getAppBaseUrl()}/api/auth/google/callback`;
}

export function getGoogleClientId(): string {
  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("GOOGLE_CLIENT_ID deve estar definido no .env");
  }
  return clientId;
}

export function assertGoogleOAuthConfigured(): {
  clientId: string;
  clientSecret: string;
} {
  const clientId = getGoogleClientId();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientSecret) {
    throw new Error("GOOGLE_CLIENT_SECRET deve estar definido no .env");
  }
  return { clientId, clientSecret };
}

export function buildGoogleAuthorizeUrl(params: {
  state: string;
  prompt?: "none" | "consent" | "select_account";
}): string {
  const clientId = getGoogleClientId();
  const redirectUri = getGoogleRedirectUri();
  const u = new URL(GOOGLE_AUTH);
  u.searchParams.set("client_id", clientId);
  u.searchParams.set("redirect_uri", redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", "openid email profile");
  u.searchParams.set("state", params.state);
  u.searchParams.set("access_type", "online");
  if (params.prompt) u.searchParams.set("prompt", params.prompt);
  return u.toString();
}

export type GoogleUserInfo = {
  id: string;
  email: string;
  verified_email?: boolean;
  name?: string;
  picture?: string;
};

export async function exchangeGoogleCode(code: string): Promise<{
  access_token: string;
}> {
  const { clientId, clientSecret } = assertGoogleOAuthConfigured();
  const redirectUri = getGoogleRedirectUri();
  const body = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch(GOOGLE_TOKEN, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const msg =
      typeof data.error_description === "string"
        ? data.error_description
        : typeof data.error === "string"
          ? data.error
          : "Falha ao trocar código por token.";
    throw new Error(msg);
  }
  const access_token = data.access_token;
  if (typeof access_token !== "string") {
    throw new Error("Resposta do Google sem access_token.");
  }
  return { access_token };
}

export async function fetchGoogleUserInfo(
  accessToken: string
): Promise<GoogleUserInfo> {
  const res = await fetch(GOOGLE_USERINFO, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(
      typeof data.error === "string" ? data.error : "Falha ao obter perfil Google."
    );
  }
  const id =
    typeof data.id === "string"
      ? data.id
      : typeof data.id === "number"
        ? String(data.id)
        : "";
  const email =
    typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  if (!id || !email) {
    throw new Error("Google não retornou id ou e-mail.");
  }
  return {
    id,
    email,
    verified_email: data.verified_email === true,
    name: typeof data.name === "string" ? data.name : undefined,
    picture: typeof data.picture === "string" ? data.picture : undefined,
  };
}
