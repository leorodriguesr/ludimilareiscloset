import { NextRequest, NextResponse } from "next/server";
import { UserRole } from "@/app/generated/prisma/client";
import { hashPassword } from "@/lib/auth-service";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { prisma } from "@/lib/prisma";

const MASTER_ADMIN_EMAIL = "adm.l.ribeiro@gmail.com";

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const gate = await requirePermission(PERMISSION.USERS_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  if (
    existing.role !== UserRole.ADMIN &&
    existing.role !== UserRole.GESTOR
  ) {
    return NextResponse.json(
      { error: "Só é possível editar usuários admin ou gestor." },
      { status: 400 }
    );
  }

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
  const password = typeof b.password === "string" ? b.password : "";
  const role =
    b.role === "ADMIN" ? UserRole.ADMIN : UserRole.GESTOR;

  if (!name || !email || !phone) {
    return NextResponse.json(
      { error: "Preencha nome, e-mail e telefone." },
      { status: 400 }
    );
  }

  if (password && password.length < 6) {
    return NextResponse.json(
      { error: "A senha deve ter no mínimo 6 caracteres." },
      { status: 400 }
    );
  }

  const isMaster = existing.email.toLowerCase() === MASTER_ADMIN_EMAIL;
  if (isMaster && email !== MASTER_ADMIN_EMAIL) {
    return NextResponse.json(
      { error: "Não é possível alterar o e-mail do administrador master." },
      { status: 400 }
    );
  }
  if (isMaster && role !== UserRole.ADMIN) {
    return NextResponse.json(
      { error: "Não é possível alterar o papel do administrador master." },
      { status: 400 }
    );
  }

  if (email !== existing.email) {
    const conflict = await prisma.user.findUnique({ where: { email } });
    if (conflict) {
      return NextResponse.json({ error: "E-mail já cadastrado." }, { status: 400 });
    }
  }

  const user = await prisma.user.update({
    where: { id },
    data: {
      name,
      email,
      phone,
      role,
      ...(password ? { passwordHash: await hashPassword(password) } : {}),
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ user });
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  const gate = await requirePermission(PERMISSION.USERS_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const { id } = await context.params;
  if (!id?.trim()) {
    return NextResponse.json({ error: "Usuário inválido." }, { status: 400 });
  }

  const existing = await prisma.user.findUnique({
    where: { id },
    select: { id: true, email: true, role: true },
  });

  if (!existing) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  if (existing.email.toLowerCase() === MASTER_ADMIN_EMAIL) {
    return NextResponse.json(
      { error: "Não é possível excluir o administrador master." },
      { status: 400 }
    );
  }

  if (
    existing.role !== UserRole.ADMIN &&
    existing.role !== UserRole.GESTOR
  ) {
    return NextResponse.json(
      { error: "Só é possível excluir usuários admin ou gestor." },
      { status: 400 }
    );
  }

  if (existing.id === gate.userId) {
    return NextResponse.json(
      { error: "Você não pode excluir a própria conta." },
      { status: 400 }
    );
  }

  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
