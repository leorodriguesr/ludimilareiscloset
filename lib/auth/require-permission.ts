import { NextResponse } from "next/server";
import { UserRole } from "@/app/generated/prisma/client";
import { hasPermission, type Permission } from "@/lib/auth/permissions";
import { requireStaffApi, type StaffSession } from "@/lib/auth/require-staff-api";

export async function requirePermission(
  permission: Permission
): Promise<NextResponse | StaffSession> {
  const gate = await requireStaffApi();
  if (gate instanceof NextResponse) return gate;
  if (!hasPermission(gate.role, permission)) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  return gate;
}
