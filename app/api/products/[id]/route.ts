import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@/app/generated/prisma/client";
import { StockType } from "@/app/generated/prisma/client";
import {
  deletePieceVariantsForPiece,
  insertPieceVariantRow,
} from "@/lib/piece-variant-sql";
import { prisma } from "@/lib/prisma";
import { productFullInclude } from "@/lib/product-include";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const product = await prisma.product.findUnique({
    where: { id },
    include: productFullInclude,
  });

  if (!product) {
    return NextResponse.json(
      { error: "Produto não encontrado." },
      { status: 404 }
    );
  }

  return NextResponse.json(product);
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;
  const body = await request.json();

  const {
    name,
    price,
    pixPrice: pixPriceRaw,
    installmentCount: installmentCountRaw,
    costPrice,
    description,
    tag,
    videoUrl,
    stockType: stockTypeRaw,
    stockQuantity: stockQtyRaw,
    weightGrams: weightRaw,
    lengthCm: lenRaw,
    widthCm: widRaw,
    heightCm: hRaw,
    images,
    pieces,
    categoryIds,
    sectionIds,
  } = body as Record<string, unknown>;

  try {
    await prisma.$transaction(async (tx) => {
      const updateData: Prisma.ProductUpdateInput = {};

      if (name !== undefined) updateData.name = String(name);
      if (price !== undefined) updateData.price = Number(price);

      if (costPrice !== undefined) {
        if (costPrice == null || costPrice === "") {
          updateData.costPrice = null;
        } else {
          const c = Number(costPrice);
          updateData.costPrice =
            Number.isFinite(c) && c >= 0 ? c : null;
        }
      }

      if (pixPriceRaw !== undefined) {
        if (pixPriceRaw == null || pixPriceRaw === "") {
          updateData.pixPrice = null;
        } else {
          const px = Number(pixPriceRaw);
          updateData.pixPrice =
            Number.isFinite(px) && px >= 0 ? px : null;
        }
      }

      if (installmentCountRaw !== undefined) {
        if (
          installmentCountRaw == null ||
          installmentCountRaw === ""
        ) {
          updateData.installmentCount = null;
        } else {
          const n = Math.floor(Number(installmentCountRaw));
          if (!Number.isFinite(n) || n < 1 || n > 24) {
            throw new Error("INVALID_INSTALLMENTS");
          }
          updateData.installmentCount = n;
        }
      }

      if (description !== undefined) {
        updateData.description = description
          ? String(description)
          : null;
      }
      if (tag !== undefined) {
        updateData.tag = tag ? String(tag) : null;
      }

      if (videoUrl !== undefined) {
        updateData.videoUrl =
          typeof videoUrl === "string" && videoUrl.trim()
            ? videoUrl.trim()
            : null;
      }

      if (stockTypeRaw !== undefined) {
        const st =
          stockTypeRaw === StockType.LIMITED
            ? StockType.LIMITED
            : StockType.UNLIMITED;
        updateData.stockType = st;
        if (st === StockType.LIMITED) {
          const q = Number(stockQtyRaw);
          updateData.stockQuantity =
            Number.isFinite(q) && q >= 0 ? Math.floor(q) : 0;
        } else {
          updateData.stockQuantity = null;
        }
      } else if (stockQtyRaw !== undefined) {
        const q = Number(stockQtyRaw);
        updateData.stockQuantity =
          Number.isFinite(q) && q >= 0 ? Math.floor(q) : 0;
      }

      if (weightRaw !== undefined) {
        if (weightRaw == null || weightRaw === "") {
          updateData.weightGrams = null;
        } else {
          const w = Number(weightRaw);
          updateData.weightGrams =
            Number.isFinite(w) && w >= 0 ? Math.round(w) : null;
        }
      }

      function setDim(
        key: "lengthCm" | "widthCm" | "heightCm",
        val: unknown
      ) {
        if (val === undefined) return;
        if (val == null || val === "") {
          updateData[key] = null;
          return;
        }
        const n = Number(val);
        updateData[key] =
          Number.isFinite(n) && n >= 0 ? n : null;
      }
      setDim("lengthCm", lenRaw);
      setDim("widthCm", widRaw);
      setDim("heightCm", hRaw);

      if (Object.keys(updateData).length > 0) {
        await tx.product.update({
          where: { id },
          data: updateData,
        });
      }

      if (images !== undefined) {
        await tx.productImage.deleteMany({ where: { productId: id } });
        await tx.productImage.createMany({
          data: (images as { url: string; colorName?: string | null }[]).map((img, i) => ({
            url: img.url,
            order: i,
            productId: id,
            colorName: typeof img.colorName === "string" && img.colorName.trim()
              ? img.colorName.trim()
              : null,
          })),
        });
      }

      if (pieces !== undefined) {
        const existingPieces = await tx.productPiece.findMany({
          where: { productId: id },
        });
        for (const p of existingPieces) {
          await deletePieceVariantsForPiece(tx, p.id);
          await tx.pieceColor.deleteMany({ where: { pieceId: p.id } });
          await tx.pieceSize.deleteMany({ where: { pieceId: p.id } });
        }
        await tx.productPiece.deleteMany({ where: { productId: id } });

        for (const piece of pieces as {
          name: string;
          colors?: { name: string; hex?: string }[];
          sizes?: { name: string }[];
          variants?: {
            colorName?: string;
            sizeName?: string;
            quantity?: number;
          }[];
        }[]) {
          const colorsIn = piece.colors ?? [];
          const sizesIn = piece.sizes ?? [];
          const created = await tx.productPiece.create({
            data: {
              name: piece.name,
              productId: id,
              ...(colorsIn.length > 0
                ? {
                    colors: {
                      create: colorsIn.map((c) => ({
                        name: c.name,
                        hex: c.hex || null,
                      })),
                    },
                  }
                : {}),
              ...(sizesIn.length > 0
                ? {
                    sizes: {
                      create: sizesIn.map((s) => ({
                        name: s.name,
                      })),
                    },
                  }
                : {}),
            },
            include: { colors: true, sizes: true },
          });

          const variantsRaw = Array.isArray(piece.variants)
            ? piece.variants
            : [];
          for (const v of variantsRaw) {
            const cn =
              typeof v.colorName === "string" ? v.colorName.trim() : "";
            const sn =
              typeof v.sizeName === "string" ? v.sizeName.trim() : "";
            if (!cn || !sn) continue;
            const q = Number(v.quantity);
            const quantity =
              Number.isFinite(q) && q >= 0 ? Math.floor(q) : 0;
            const color = created.colors.find((c) => c.name === cn);
            const size = created.sizes.find((s) => s.name === sn);
            if (!color || !size) continue;
            await insertPieceVariantRow(tx, {
              pieceId: created.id,
              colorId: color.id,
              sizeId: size.id,
              quantity,
            });
          }
        }
      }

      if (categoryIds !== undefined) {
        const ids = Array.isArray(categoryIds)
          ? categoryIds.filter((x): x is string => typeof x === "string")
          : [];
        if (ids.length > 0) {
          const found = await tx.category.findMany({
            where: { id: { in: ids } },
          });
          if (found.length !== ids.length) {
            throw new Error("INVALID_CATEGORY");
          }
        }
        await tx.productCategory.deleteMany({ where: { productId: id } });
        if (ids.length > 0) {
          await tx.productCategory.createMany({
            data: ids.map((categoryId) => ({ productId: id, categoryId })),
          });
        }
      }

      if (sectionIds !== undefined) {
        const ids = Array.isArray(sectionIds)
          ? sectionIds.filter((x): x is string => typeof x === "string")
          : [];
        if (ids.length > 0) {
          const found = await tx.section.findMany({
            where: { id: { in: ids } },
          });
          if (found.length !== ids.length) {
            throw new Error("INVALID_SECTION");
          }
        }
        await tx.productSection.deleteMany({ where: { productId: id } });
        if (ids.length > 0) {
          await tx.productSection.createMany({
            data: ids.map((sectionId) => ({ productId: id, sectionId })),
          });
        }
      }
    });

    const product = await prisma.product.findUnique({
      where: { id },
      include: productFullInclude,
    });

    return NextResponse.json(product);
  } catch (e) {
    if (e instanceof Error && e.message === "INVALID_INSTALLMENTS") {
      return NextResponse.json(
        { error: "Parcelas deve ser entre 1 e 24, ou vazio." },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "INVALID_CATEGORY") {
      return NextResponse.json(
        { error: "Uma ou mais categorias são inválidas." },
        { status: 400 }
      );
    }
    if (e instanceof Error && e.message === "INVALID_SECTION") {
      return NextResponse.json(
        { error: "Uma ou mais seções são inválidas." },
        { status: 400 }
      );
    }
    console.error("[PUT /api/products]", e);
    return NextResponse.json(
      { error: "Não foi possível atualizar o produto." },
      { status: 404 }
    );
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
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json(
      { error: "Produto não encontrado." },
      { status: 404 }
    );
  }
}
