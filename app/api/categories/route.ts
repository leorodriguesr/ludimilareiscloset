import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/require-admin-api";
import { slugify } from "@/lib/slug";

async function nextAvailableSlug(baseSlug: string) {
  let candidate = baseSlug;
  let n = 0;
  while (await prisma.category.findUnique({ where: { slug: candidate } })) {
    n += 1;
    candidate = `${baseSlug}-${n}`;
  }
  return candidate;
}

export async function GET() {
  try {
    const categories = await prisma.category.findMany({
      orderBy: { name: "asc" },
    });
    return NextResponse.json(categories);
  } catch (error) {
    console.error("[GET /api/categories]", error);
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
    const slug = await nextAvailableSlug(base);
    const category = await prisma.category.create({
      data: { name, slug },
    });
    return NextResponse.json(category, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    throw error;
  }
}
