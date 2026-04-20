import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth-session";

export async function requireAdminApi(): Promise<
  NextResponse | { userId: string }
> {
  const session = await getAppSession();
  const user = session.user;
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  if (user.role !== "ADMIN") {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  return { userId: user.userId };
}
