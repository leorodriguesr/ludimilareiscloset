import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { registerClient } from "@/lib/auth-service";
import { getSessionOptions, type AppSessionData } from "@/lib/session";

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }
  const b = body as Record<string, unknown>;
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const phone = typeof b.phone === "string" ? b.phone.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";

  if (!name || !email || !phone || !password) {
    return NextResponse.json(
      { error: "Preencha nome, e-mail, telefone e senha." },
      { status: 400 }
    );
  }
  if (password.length < 6) {
    return NextResponse.json(
      { error: "A senha deve ter pelo menos 6 caracteres." },
      { status: 400 }
    );
  }

  const result = await registerClient({ name, email, phone, password });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const cookieStore = await cookies();
  const session = await getIronSession<AppSessionData>(
    cookieStore,
    getSessionOptions()
  );
  session.user = {
    userId: result.user.id,
    role: "CLIENT",
  };
  await session.save();

  return NextResponse.json({
    ok: true,
    user: { id: result.user.id, email: result.user.email, name: result.user.name },
  });
}
