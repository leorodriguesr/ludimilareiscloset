import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/app/generated/prisma/client";
import { getIronSession } from "iron-session";
import { signInOrLinkGoogleUser } from "@/lib/auth-service";
import {
  exchangeGoogleCode,
  fetchGoogleUserInfo,
  GOOGLE_OAUTH_NEXT_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/lib/google-oauth";
import { getSessionOptions, type AppSessionData } from "@/lib/session";

function baseFromRequest(request: NextRequest): URL {
  return new URL(request.url);
}

export async function GET(request: NextRequest) {
  const base = baseFromRequest(request);

  try {
    const err = request.nextUrl.searchParams.get("error");
    const desc = request.nextUrl.searchParams.get("error_description");

    if (err) {
      const human =
        err === "access_denied"
          ? "Login Google cancelado."
          : desc ?? err;
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(human)}`, base)
      );
    }

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const cookieStore = await cookies();
    const savedState = cookieStore.get(GOOGLE_OAUTH_STATE_COOKIE)?.value;
    const nextRaw = cookieStore.get(GOOGLE_OAUTH_NEXT_COOKIE)?.value;

    if (!code || !state || !savedState || state !== savedState) {
      return NextResponse.redirect(
        new URL(
          "/login?error=" +
            encodeURIComponent("Sessão de login inválida. Tente novamente."),
          base
        )
      );
    }

    let profile;
    try {
      const { access_token } = await exchangeGoogleCode(code);
      profile = await fetchGoogleUserInfo(access_token);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Falha no login Google.";
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(msg)}`, base)
      );
    }

    if (profile.verified_email === false) {
      return NextResponse.redirect(
        new URL(
          "/login?error=" +
            encodeURIComponent(
              "Confirme o e-mail na conta Google antes de continuar."
            ),
          base
        )
      );
    }

    let result;
    try {
      result = await signInOrLinkGoogleUser({
        googleId: profile.id,
        email: profile.email,
        name: profile.name ?? "",
        picture: profile.picture,
      });
    } catch (e) {
      console.error("[google/callback] Prisma:", e);
      const msg =
        e instanceof Error ? e.message : "Erro ao guardar a conta.";
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(msg)}`, base)
      );
    }

    if (!result.ok) {
      const msg =
        result.code === "admin_google"
          ? "Conta administrativa: use e-mail e senha no painel admin."
          : "Não foi possível entrar com Google.";
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(msg)}`, base)
      );
    }

    const user = result.user;
    if (user.role !== UserRole.CLIENT) {
      return NextResponse.redirect(
        new URL(
          "/login?error=" +
            encodeURIComponent(
              "Login Google disponível apenas para clientes da loja."
            ),
          base
        )
      );
    }

    const nextPath =
      nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//")
        ? nextRaw
        : "/minha-conta";

    const redirectUrl = new URL(nextPath, base);

    /**
     * Gravar sessão via `cookies()` para o Next fundir o Set-Cookie no mesmo
     * `NextResponse.redirect` que devolvemos (o fluxo request+tempResponse
     * não aplicava o cookie da sessão no browser).
     */
    const session = await getIronSession<AppSessionData>(
      cookieStore,
      getSessionOptions()
    );
    session.user = { userId: user.id, role: "CLIENT" };
    await session.save();

    const res = NextResponse.redirect(redirectUrl);
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure,
      sameSite: "lax",
    });
    res.cookies.set(GOOGLE_OAUTH_NEXT_COOKIE, "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      secure,
      sameSite: "lax",
    });

    return res;
  } catch (e) {
    console.error("[google/callback]", e);
    return NextResponse.redirect(
      new URL(
        "/login?error=" +
          encodeURIComponent(
            "Erro inesperado no login Google. Tente de novo ou use e-mail e senha."
          ),
        base
      )
    );
  }
}
