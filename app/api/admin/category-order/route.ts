import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function PUT(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const ids = (body as { ids?: unknown }).ids;
  if (!Array.isArray(ids) || ids.some((id) => typeof id !== "string" || !id)) {
    return NextResponse.json({ error: "Ordem inválida." }, { status: 400 });
  }

  const unique = new Set(ids);
  if (unique.size !== ids.length) {
    return NextResponse.json({ error: "Ordem inválida." }, { status: 400 });
  }

  const existing = await prisma.category.findMany({ select: { id: true } });
  if (
    existing.length !== ids.length ||
    existing.some((category) => !unique.has(category.id))
  ) {
    return NextResponse.json({ error: "Ordem inválida." }, { status: 400 });
  }

  await prisma.$transaction(
    ids.map((id, index) =>
      prisma.category.update({
        where: { id },
        data: { order: index },
      })
    )
  );

  return NextResponse.json({ ok: true });
}
