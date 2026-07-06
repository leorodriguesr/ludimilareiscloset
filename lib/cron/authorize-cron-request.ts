import { timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

/** Valida `Authorization: Bearer <CRON_SECRET>` (padrão Vercel Cron). */
export function isCronRequestAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) {
    return process.env.NODE_ENV !== "production";
  }

  const auth = request.headers.get("authorization")?.trim() ?? "";
  const expected = `Bearer ${secret}`;

  try {
    const a = Buffer.from(auth, "utf8");
    const b = Buffer.from(expected, "utf8");
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return auth === expected;
  }
}
