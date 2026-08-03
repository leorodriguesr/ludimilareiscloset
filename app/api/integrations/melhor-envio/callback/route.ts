import { NextRequest, NextResponse } from "next/server";
import {
  completeMelhorEnvioOAuth,
  consumeMelhorEnvioOAuthState,
} from "@/lib/shipping/melhor-envio/auth";
import { resolveMelhorEnvioPublicOrigin } from "@/lib/shipping/melhor-envio/public-url";

const OAUTH_STATE_COOKIE = "me_oauth_state";

function redirectWithStatus(
  request: NextRequest,
  status: "ok" | "error",
  message?: string
) {
  const url = new URL("/admin", resolveMelhorEnvioPublicOrigin(request));
  url.searchParams.set("section", "shipping");
  url.searchParams.set("me_oauth", status);
  if (message) url.searchParams.set("me_oauth_msg", message.slice(0, 180));

  const res = NextResponse.redirect(url);
  res.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
  return res;
}

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code")?.trim();
  const state = request.nextUrl.searchParams.get("state")?.trim();
  const oauthError = request.nextUrl.searchParams.get("error");
  const cookieState = request.cookies.get(OAUTH_STATE_COOKIE)?.value?.trim();

  if (oauthError) {
    return redirectWithStatus(
      request,
      "error",
      request.nextUrl.searchParams.get("error_description") || oauthError
    );
  }

  if (!code || !state) {
    return redirectWithStatus(
      request,
      "error",
      "Código ou state ausente no retorno do Melhor Envio."
    );
  }

  // Cookie (preferencial) + banco — evita falso negativo quando o Host/ngrok
  // ou o DB divergem durante o redirect.
  const cookieOk = Boolean(cookieState && cookieState === state);
  const dbOk = await consumeMelhorEnvioOAuthState(state);
  if (!cookieOk && !dbOk) {
    console.warn("[melhor-envio callback] state inválido", {
      hasCookie: Boolean(cookieState),
      cookieMatch: cookieOk,
      dbOk,
    });
    return redirectWithStatus(
      request,
      "error",
      "State OAuth inválido ou expirado. Clique em Conectar novamente."
    );
  }

  try {
    await completeMelhorEnvioOAuth(code);
    return redirectWithStatus(request, "ok");
  } catch (e) {
    console.error("[GET /api/integrations/melhor-envio/callback]", e);
    const msg = e instanceof Error ? e.message : "Falha ao trocar token.";
    return redirectWithStatus(request, "error", msg);
  }
}
