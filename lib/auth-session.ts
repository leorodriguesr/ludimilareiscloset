import { getIronSession } from "iron-session";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import type { AppSessionData } from "@/lib/session";
import { getSessionOptions } from "@/lib/session";

export async function getAppSession() {
  const cookieStore = await cookies();
  return getIronSession<AppSessionData>(cookieStore, getSessionOptions());
}

export async function getSessionFromRequest(
  request: NextRequest,
  response: NextResponse
) {
  return getIronSession<AppSessionData>(request, response, getSessionOptions());
}

export async function destroySession() {
  const session = await getAppSession();
  session.destroy();
}
