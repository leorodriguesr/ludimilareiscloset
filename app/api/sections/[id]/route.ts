import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/require-admin-api";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body as {
    name?: unknown;
    order?: unknown;
    isActive?: unknown;
  };

  const data: { name?: string; order?: number; isActive?: boolean } = {};

  if (typeof b.name === "string" && b.name.trim()) {
    data.name = b.name.trim();
  }
  if (typeof b.order === "number") {
    data.order = b.order;
  }
  if (typeof b.isActive === "boolean") {
    data.isActive = b.isActive;
  }

  try {
    const section = await prisma.section.update({
      where: { id },
      data,
    });
    return NextResponse.json(section);
  } catch {
    return NextResponse.json(
      { error: "Seção não encontrada." },
      { status: 404 }
    );
  }
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  try {
    await prisma.section.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json(
      { error: "Seção não encontrada." },
      { status: 404 }
    );
  }
}
