import { AdminPanel } from "@/components/admin/AdminPanel";
import { getAppSession } from "@/lib/auth-session";
import type { AppRole } from "@/lib/auth/permissions";
import { isStaffRole } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

export default async function AdminPage() {
  const session = await getAppSession();
  let initialRole: AppRole | null = null;

  if (session.user) {
    const row = await prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { role: true },
    });
    if (row && isStaffRole(row.role)) {
      initialRole = row.role;
    }
  }

  return <AdminPanel initialRole={initialRole} />;
}
