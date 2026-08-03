import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import type { AppSessionData } from "@/lib/session";
import { getSessionOptions } from "@/lib/session";

function isStaffRole(role: string | undefined): boolean {
  return role === "ADMIN" || role === "GESTOR";
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const isAdminArea =
    pathname === "/admin" || pathname.startsWith("/admin/");
  const isAdminLogin =
    pathname === "/admin/login" || pathname.startsWith("/admin/login/");
  const isMinhaConta =
    pathname === "/minha-conta" || pathname.startsWith("/minha-conta/");

  if (!isAdminArea && !isMinhaConta) {
    return NextResponse.next();
  }

  let sessionOptions;
  try {
    sessionOptions = getSessionOptions();
  } catch {
    console.error(
      "[middleware] SESSION_SECRET ausente ou curto. Defina no .env (mín. 32 caracteres)."
    );
    if ((isAdminArea && !isAdminLogin) || isMinhaConta) {
      return new NextResponse(
        "Configuração de sessão inválida. Defina SESSION_SECRET no ambiente.",
        { status: 500 }
      );
    }
    return NextResponse.next();
  }

  const res = NextResponse.next();
  const session = await getIronSession<AppSessionData>(
    request,
    res,
    sessionOptions
  );
  const user = session.user;

  if (isAdminArea && !isAdminLogin) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin/login";
      // Mantém retorno do OAuth Melhor Envio visível após re-login.
      const meOauth = request.nextUrl.searchParams.get("me_oauth");
      const meOauthMsg = request.nextUrl.searchParams.get("me_oauth_msg");
      url.search = "";
      if (meOauth) {
        url.searchParams.set("next", "/admin?section=shipping");
        url.searchParams.set("me_oauth", meOauth);
        if (meOauthMsg) url.searchParams.set("me_oauth_msg", meOauthMsg);
      }
      return NextResponse.redirect(url);
    }
    if (!isStaffRole(user.role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/";
      url.searchParams.set("aviso", "admin");
      return NextResponse.redirect(url);
    }
    return res;
  }

  if (isAdminLogin) {
    if (isStaffRole(user?.role)) {
      const url = request.nextUrl.clone();
      url.pathname = "/admin";
      url.search = "";
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (isMinhaConta) {
    if (!user) {
      const url = request.nextUrl.clone();
      url.pathname = "/login";
      url.searchParams.set("next", pathname);
      return NextResponse.redirect(url);
    }
    return res;
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/admin", "/admin/:path*", "/minha-conta", "/minha-conta/:path*"],
};
