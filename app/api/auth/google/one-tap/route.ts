import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";
import { getIronSession } from "iron-session";
import { UserRole } from "@/app/generated/prisma/client";
import { signInOrLinkGoogleUser } from "@/lib/auth-service";
import { getSessionOptions, type AppSessionData } from "@/lib/session";

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const credential = typeof body?.credential === "string" ? body.credential : null;

    if (!credential) {
      return NextResponse.json({ error: "Credencial ausente." }, { status: 400 });
    }

    const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
    if (!clientId) {
      return NextResponse.json({ error: "Google OAuth não configurado." }, { status: 500 });
    }

    // Verifica o ID token com o endpoint do Google
    const verifyRes = await fetch(
      `https://oauth2.googleapis.com/tokeninfo?id_token=${credential}`,
      { cache: "no-store" }
    );

    if (!verifyRes.ok) {
      return NextResponse.json({ error: "Credencial inválida." }, { status: 401 });
    }

    const payload = await verifyRes.json() as Record<string, string>;

    // Valida que o token foi emitido para esta aplicação
    if (payload.aud !== clientId) {
      return NextResponse.json({ error: "Credencial inválida." }, { status: 401 });
    }

    if (!payload.sub || !payload.email) {
      return NextResponse.json({ error: "Dados insuficientes no token." }, { status: 401 });
    }

    const result = await signInOrLinkGoogleUser({
      googleId: payload.sub,
      email: payload.email,
      name: payload.name ?? "",
      picture: payload.picture,
    });

    if (!result.ok) {
      return NextResponse.json({ error: "Não foi possível entrar." }, { status: 403 });
    }

    if (result.user.role !== UserRole.CLIENT) {
      return NextResponse.json({ error: "Login One Tap disponível apenas para clientes." }, { status: 403 });
    }

    const cookieStore = await cookies();
    const session = await getIronSession<AppSessionData>(cookieStore, getSessionOptions());
    session.user = { userId: result.user.id, role: "CLIENT" };
    await session.save();

    return NextResponse.json({ ok: true });
  } catch (e) {
    console.error("[google/one-tap]", e);
    return NextResponse.json({ error: "Erro inesperado." }, { status: 500 });
  }
}
