import type { Prisma } from "@/app/generated/prisma/client";
import { prisma } from "@/lib/prisma";

type Db = Prisma.TransactionClient | typeof prisma;

export class SectionProductOrderError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message);
    this.name = "SectionProductOrderError";
  }
}

export async function nextOrdersForSections(
  db: Db,
  sectionIds: string[],
  keep: Map<string, number> = new Map()
): Promise<{ sectionId: string; sortOrder: number }[]> {
  const unique = [...new Set(sectionIds.filter(Boolean))];
  const maxBySection = new Map<string, number>();

  if (unique.length > 0) {
    const grouped = await db.productSection.groupBy({
      by: ["sectionId"],
      where: { sectionId: { in: unique } },
      _max: { sortOrder: true },
    });
    for (const row of grouped) {
      maxBySection.set(row.sectionId, row._max.sortOrder ?? -1);
    }
  }

  return unique.map((sectionId) => {
    const kept = keep.get(sectionId);
    if (kept != null) return { sectionId, sortOrder: kept };
    const next = (maxBySection.get(sectionId) ?? -1) + 1;
    maxBySection.set(sectionId, next);
    return { sectionId, sortOrder: next };
  });
}

export async function sectionRowsForProduct(
  db: Db,
  productId: string,
  sectionIds: string[]
): Promise<{ productId: string; sectionId: string; sortOrder: number }[]> {
  const existing = await db.productSection.findMany({
    where: { productId },
    select: { sectionId: true, sortOrder: true },
  });
  const keep = new Map(existing.map((row) => [row.sectionId, row.sortOrder]));
  const assigned = await nextOrdersForSections(db, sectionIds, keep);
  return assigned.map((row) => ({ productId, ...row }));
}

export type SectionProductOrderItem = {
  id: string;
  name: string;
  imageUrl: string | null;
  visibleOnSite: boolean;
};

export type SectionProductOrderGroup = {
  id: string;
  name: string;
  isActive: boolean;
  products: SectionProductOrderItem[];
};

export async function listSectionProductOrder(): Promise<
  SectionProductOrderGroup[]
> {
  const sections = await prisma.section.findMany({
    orderBy: [{ isActive: "desc" }, { order: "asc" }, { name: "asc" }],
    include: {
      products: {
        orderBy: [{ sortOrder: "asc" }, { product: { createdAt: "desc" } }],
        include: {
          product: {
            select: {
              id: true,
              name: true,
              visibleOnSite: true,
              images: {
                orderBy: { order: "asc" },
                take: 1,
                select: { url: true },
              },
            },
          },
        },
      },
    },
  });

  return sections.map((section) => ({
    id: section.id,
    name: section.name,
    isActive: section.isActive,
    products: section.products.map((row) => ({
      id: row.product.id,
      name: row.product.name,
      imageUrl: row.product.images[0]?.url ?? null,
      visibleOnSite: row.product.visibleOnSite,
    })),
  }));
}

export async function saveSectionProductOrder(
  sectionId: string,
  productIds: string[]
): Promise<void> {
  const section = await prisma.section.findUnique({
    where: { id: sectionId },
    select: { id: true },
  });
  if (!section) {
    throw new SectionProductOrderError("Seção não encontrada.", 404);
  }

  const uniqueIds = [
    ...new Set(productIds.filter((id) => typeof id === "string" && id.trim())),
  ];
  const current = await prisma.productSection.findMany({
    where: { sectionId },
    select: { productId: true },
  });
  const currentIds = new Set(current.map((row) => row.productId));
  if (
    uniqueIds.length !== current.length ||
    uniqueIds.some((id) => !currentIds.has(id))
  ) {
    throw new SectionProductOrderError(
      "A lista deve conter exatamente os produtos desta seção.",
      400
    );
  }

  await prisma.$transaction(
    uniqueIds.map((productId, index) =>
      prisma.productSection.update({
        where: { productId_sectionId: { productId, sectionId } },
        data: { sortOrder: index },
      })
    )
  );
}
