import { NextResponse } from "next/server";
import { UserRole } from "@/app/generated/prisma/client";
import { getAppSession } from "@/lib/auth-session";
import { isStaffRole } from "@/lib/auth/permissions";

export type StaffSession = {
  userId: string;
  role: UserRole;
};

export async function requireStaffApi(): Promise<
  NextResponse | StaffSession
> {
  const session = await getAppSession();
  const user = session.user;
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const role = user.role as UserRole;
  if (!isStaffRole(role)) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }
  return { userId: user.userId, role };
}
