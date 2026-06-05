import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions, type AppSessionData } from "@/lib/session";

async function destroyCurrentSession() {
  const cookieStore = await cookies();
  const session = await getIronSession<AppSessionData>(
    cookieStore,
    getSessionOptions()
  );
  session.destroy();
}

export async function POST() {
  await destroyCurrentSession();
  return NextResponse.json({ ok: true });
}

/**
 * Usado quando um Server Component detecta uma sessão órfã (usuário do cookie
 * não existe mais no banco). Server Components não podem alterar cookies, então
 * redirecionam para cá para limpar a sessão e seguir para o destino.
 */
export async function GET(request: NextRequest) {
  await destroyCurrentSession();

  const nextParam = request.nextUrl.searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/login";

  return NextResponse.redirect(new URL(safeNext, request.url));
}
