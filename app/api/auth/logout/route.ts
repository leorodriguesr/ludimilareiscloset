import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { getIronSession } from "iron-session";
import { getSessionOptions, type AppSessionData } from "@/lib/session";

export async function POST() {
  const cookieStore = await cookies();
  const session = await getIronSession<AppSessionData>(
    cookieStore,
    getSessionOptions()
  );
  session.destroy();
  return NextResponse.json({ ok: true });
}
