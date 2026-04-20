import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { authenticateUser, type LoginIntent } from "@/lib/auth-service";
import { getSessionOptions, type AppSessionData } from "@/lib/session";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const email = typeof b.email === "string" ? b.email : "";
  const password = typeof b.password === "string" ? b.password : "";
  const intentRaw = b.intent;
  const intent: LoginIntent =
    intentRaw === "admin" ? "admin" : "client";

  if (!email.trim() || !password) {
    return NextResponse.json(
      { error: "Informe e-mail e senha." },
      { status: 400 }
    );
  }

  const auth = await authenticateUser(email, password, intent);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: 401 });
  }

  const cookieStore = await cookies();
  const session = await getIronSession<AppSessionData>(
    cookieStore,
    getSessionOptions()
  );
  session.user = {
    userId: auth.user.id,
    role: auth.user.role,
  };
  await session.save();

  return NextResponse.json({
    ok: true,
    user: {
      id: auth.user.id,
      email: auth.user.email,
      name: auth.user.name,
      role: auth.user.role,
    },
  });
}
