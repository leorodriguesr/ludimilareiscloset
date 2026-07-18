import { NextResponse } from "next/server";
import { UserRole } from "@/app/generated/prisma/client";
import { getAppSession } from "@/lib/auth-session";
import { isStaffRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

export type StaffSession = {
  userId: string;
  role: UserRole;
};

/**
 * Staff autenticado com role atual do banco (não só da sessão,
 * para refletir mudanças de perfil sem depender de re-login).
 */
export async function requireStaffApi(): Promise<
  NextResponse | StaffSession
> {
  const session = await getAppSession();
  const user = session.user;
  if (!user) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }

  const row = await prisma.user.findUnique({
    where: { id: user.userId },
    select: { id: true, role: true },
  });
  if (!row || !isStaffRole(row.role)) {
    return NextResponse.json({ error: "Acesso negado." }, { status: 403 });
  }

  if (user.role !== row.role) {
    session.user = { userId: row.id, role: row.role };
    await session.save();
  }

  return { userId: row.id, role: row.role };
}
