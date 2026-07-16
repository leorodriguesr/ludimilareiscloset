import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { productListInclude } from "@/lib/product-include";
import { publicCatalogProductWhere } from "@/lib/public-product-where";

export async function GET(request: NextRequest) {
  const q = request.nextUrl.searchParams.get("q")?.trim() ?? "";

  if (q.length < 2) {
    return NextResponse.json({ products: [], categories: [] });
  }

  const [products, categories] = await Promise.all([
    prisma.product.findMany({
      where: {
        AND: [
          publicCatalogProductWhere,
          {
            OR: [
              { name: { contains: q } },
              { description: { contains: q } },
              { tag: { contains: q } },
            ],
          },
        ],
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: productListInclude,
    }),
    prisma.category.findMany({
      where: { name: { contains: q } },
      orderBy: { name: "asc" },
      take: 5,
    }),
  ]);

  return NextResponse.json({ products, categories });
}
