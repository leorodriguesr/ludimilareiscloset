import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/app/generated/prisma/client";
import { hashPassword } from "@/lib/auth-service";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const gate = await requirePermission(PERMISSION.USERS_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const users = await prisma.user.findMany({
    where: { role: { in: [UserRole.ADMIN, UserRole.GESTOR] } },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ users });
}

export async function POST(request: NextRequest) {
  const gate = await requirePermission(PERMISSION.USERS_MANAGE);
  if (gate instanceof NextResponse) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const name = String(b.name ?? "").trim();
  const email = String(b.email ?? "").trim().toLowerCase();
  const phone = String(b.phone ?? "").trim();
  const password = String(b.password ?? "");
  const role =
    b.role === "ADMIN" ? UserRole.ADMIN : UserRole.GESTOR;

  if (!name || !email || !phone || password.length < 6) {
    return NextResponse.json(
      { error: "Preencha nome, e-mail, telefone e senha (mín. 6 caracteres)." },
      { status: 400 }
    );
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json({ error: "E-mail já cadastrado." }, { status: 400 });
  }

  const user = await prisma.user.create({
    data: {
      name,
      email,
      phone,
      passwordHash: await hashPassword(password),
      role,
    },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
  });

  return NextResponse.json({ user });
}
