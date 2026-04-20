import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/require-admin-api";
import { slugify } from "@/lib/slug";

async function uniqueSlug(
  desired: string,
  excludeId: string
): Promise<string> {
  const base = slugify(desired);
  for (let n = 0; n < 100; n++) {
    const candidate = n === 0 ? base : `${base}-${n}`;
    const existing = await prisma.category.findUnique({
      where: { slug: candidate },
    });
    if (!existing || existing.id === excludeId) return candidate;
  }
  return `${base}-${Date.now()}`;
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body as { name?: unknown; slug?: unknown };
  const name =
    typeof b.name === "string" && b.name.trim() ? b.name.trim() : undefined;
  const slugRaw =
    typeof b.slug === "string" && b.slug.trim() ? b.slug.trim() : undefined;

  try {
    const current = await prisma.category.findUnique({ where: { id } });
    if (!current) {
      return NextResponse.json({ error: "Categoria não encontrada." }, { status: 404 });
    }

    let slug: string | undefined;
    if (slugRaw !== undefined) {
      slug = await uniqueSlug(slugRaw, id);
    } else if (name !== undefined) {
      slug = await uniqueSlug(name, id);
    }

    const category = await prisma.category.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(slug !== undefined && { slug }),
      },
    });
    return NextResponse.json(category);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json({ error: "Erro ao atualizar." }, { status: 500 });
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  try {
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Categoria não encontrada." },
      { status: 404 }
    );
  }
}
