import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth-session";
import { requireStaffApi } from "@/lib/auth/require-staff-api";

/** @deprecated Use requireStaffApi ou requirePermission. Mantido para compatibilidade. */
export async function requireAdminApi(): Promise<
  NextResponse | { userId: string }
> {
  const gate = await requireStaffApi();
  if (gate instanceof NextResponse) return gate;
  return { userId: gate.userId };
}
