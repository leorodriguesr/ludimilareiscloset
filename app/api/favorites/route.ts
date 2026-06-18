import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getAppSession();
  if (!session.user) {
    return NextResponse.json([]);
  }
  const favorites = await prisma.favorite.findMany({
    where: { userId: session.user.userId },
    select: { productId: true },
  });
  return NextResponse.json(favorites.map((f) => f.productId));
}

export async function POST(request: NextRequest) {
  const session = await getAppSession();
  if (!session.user) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const productId =
    typeof (body as { productId?: unknown }).productId === "string"
      ? ((body as { productId: string }).productId)
      : null;

  if (!productId) {
    return NextResponse.json({ error: "productId obrigatório." }, { status: 400 });
  }

  const existing = await prisma.favorite.findUnique({
    where: { userId_productId: { userId: session.user.userId, productId } },
  });

  if (existing) {
    await prisma.favorite.delete({ where: { id: existing.id } });
    return NextResponse.json({ favorited: false });
  }

  await prisma.favorite.create({
    data: { userId: session.user.userId, productId },
  });
  return NextResponse.json({ favorited: true });
}
