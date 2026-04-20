import { randomBytes } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import {
  buildGoogleAuthorizeUrl,
  GOOGLE_OAUTH_NEXT_COOKIE,
  GOOGLE_OAUTH_STATE_COOKIE,
} from "@/lib/google-oauth";

function sanitizeNext(raw: string | null): string | null {
  if (raw == null || raw === "") return null;
  if (!raw.startsWith("/") || raw.startsWith("//")) return null;
  return raw;
}

export async function GET(request: NextRequest) {
  try {
    const next = sanitizeNext(request.nextUrl.searchParams.get("next"));
    const state = randomBytes(24).toString("hex");
    const url = buildGoogleAuthorizeUrl({ state, prompt: "select_account" });

    const res = NextResponse.redirect(url);
    const secure = process.env.NODE_ENV === "production";
    res.cookies.set(GOOGLE_OAUTH_STATE_COOKIE, state, {
      httpOnly: true,
      secure,
      sameSite: "lax",
      path: "/",
      maxAge: 600,
    });
    if (next) {
      res.cookies.set(GOOGLE_OAUTH_NEXT_COOKIE, next, {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: 600,
      });
    } else {
      res.cookies.set(GOOGLE_OAUTH_NEXT_COOKIE, "", {
        httpOnly: true,
        secure,
        sameSite: "lax",
        path: "/",
        maxAge: 0,
      });
    }
    return res;
  } catch (e) {
    const msg = e instanceof Error ? e.message : "OAuth não configurado.";
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(msg)}`,
        request.url
      )
    );
  }
}
