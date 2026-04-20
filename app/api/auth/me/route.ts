import { NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getAppSession();
  if (!session.user) {
    return NextResponse.json({ user: null });
  }
  const row = await prisma.user.findUnique({
    where: { id: session.user.userId },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });
  if (!row) {
    session.destroy();
    await session.save();
    return NextResponse.json({ user: null });
  }
  return NextResponse.json({
    user: {
      id: row.id,
      name: row.name,
      email: row.email,
      phone: row.phone,
      role: row.role,
      createdAt: row.createdAt.toISOString(),
    },
  });
}
