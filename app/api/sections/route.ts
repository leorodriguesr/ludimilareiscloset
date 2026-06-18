import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/require-admin-api";
import { slugify } from "@/lib/slug";

async function nextAvailableSlug(baseSlug: string) {
  let candidate = baseSlug;
  let n = 0;
  while (await prisma.section.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${baseSlug}-${n}`;
  }
  return candidate;
}

export async function GET() {
  try {
    const sections = await prisma.section.findMany({
      orderBy: { order: "asc" },
    });
    return NextResponse.json(sections);
  } catch (error) {
    console.error("[GET /api/sections]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body as { name?: unknown; slug?: unknown };
  const name = typeof b.name === "string" ? b.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Nome é obrigatório." }, { status: 400 });
  }

  const base =
    typeof b.slug === "string" && b.slug.trim()
      ? slugify(b.slug.trim())
      : slugify(name);

  try {
    const maxOrder = await prisma.section.aggregate({ _max: { order: true } });
    const nextOrder = (maxOrder._max.order ?? -1) + 1;
    const slug = await nextAvailableSlug(base);
    const section = await prisma.section.create({
      data: { name, slug, order: nextOrder },
    });
    return NextResponse.json(section, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
