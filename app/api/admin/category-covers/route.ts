import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { publicCatalogProductWhere } from "@/lib/public-product-where";
import { requireAdminApi } from "@/lib/require-admin-api";

const PRODUCTS_PER_CATEGORY = 12;
const IMAGES_PER_PRODUCT = 3;
const PHOTOS_PER_CATEGORY = 24;

export async function GET() {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  try {
    const categories = await prisma.category.findMany({
      orderBy: [{ order: "asc" }, { name: "asc" }],
      include: {
        products: {
          where: { product: publicCatalogProductWhere },
          take: PRODUCTS_PER_CATEGORY,
          orderBy: { product: { createdAt: "desc" } },
          select: {
            product: {
              select: {
                name: true,
                images: {
                  orderBy: { order: "asc" },
                  take: IMAGES_PER_PRODUCT,
                  select: { url: true },
                },
              },
            },
          },
        },
      },
    });

    return NextResponse.json(
      categories.map((category) => {
        const seen = new Set<string>();
        const photos: { url: string; productName: string }[] = [];
        for (const link of category.products) {
          for (const image of link.product.images) {
            if (!image.url || seen.has(image.url)) continue;
            seen.add(image.url);
            photos.push({ url: image.url, productName: link.product.name });
            if (photos.length >= PHOTOS_PER_CATEGORY) break;
          }
          if (photos.length >= PHOTOS_PER_CATEGORY) break;
        }

        return {
          id: category.id,
          name: category.name,
          slug: category.slug,
          order: category.order,
          coverImageUrl: category.coverImageUrl,
          photos,
        };
      })
    );
  } catch (error) {
    console.error("[GET /api/admin/category-covers]", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erro ao listar." },
      { status: 500 }
    );
  }
}
