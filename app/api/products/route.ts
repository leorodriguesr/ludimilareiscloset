import { NextRequest, NextResponse } from "next/server";
import { Prisma, StockType } from "@/app/generated/prisma/client";
import { insertPieceVariantRow } from "@/lib/piece-variant-sql";
import { prisma } from "@/lib/prisma";
import { productFullInclude } from "@/lib/product-include";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function GET(request: NextRequest) {
  try {
    const categoryId = request.nextUrl.searchParams.get("categoryId");
    const where = categoryId
      ? { categories: { some: { categoryId } } }
      : {};

    const products = await prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: productFullInclude,
    });
    return NextResponse.json(products);
  } catch (error) {
    console.error("[GET /api/products]", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao listar produtos.",
      },
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
    return NextResponse.json(
      { error: "Corpo da requisição não é JSON válido." },
      { status: 400 }
    );
  }

  const b = body as Record<string, unknown>;

  const name = typeof b.name === "string" ? b.name : "";
  const price = b.price;
  const images = Array.isArray(b.images) ? b.images : [];
  const piecesRaw = Array.isArray(b.pieces) ? b.pieces : [];

  if (!name.trim() || price == null) {
    return NextResponse.json(
      { error: "Nome e preço são obrigatórios." },
      { status: 400 }
    );
  }

  const priceNum = Number(price);
  if (Number.isNaN(priceNum) || priceNum < 0) {
    return NextResponse.json({ error: "Preço inválido." }, { status: 400 });
  }

  let installmentCount: number | null = null;
  const icRaw = b.installmentCount;
  if (icRaw !== undefined && icRaw !== null && icRaw !== "") {
    const n = Math.floor(Number(icRaw));
    if (!Number.isFinite(n) || n < 1 || n > 24) {
      return NextResponse.json(
        { error: "Parcelas deve ser um número entre 1 e 24, ou vazio." },
        { status: 400 }
      );
    }
    installmentCount = n;
  }

  const costPriceRaw = b.costPrice;
  let costPrice: number | null = null;
  if (costPriceRaw != null && costPriceRaw !== "") {
    const c = Number(costPriceRaw);
    if (Number.isNaN(c) || c < 0) {
      return NextResponse.json({ error: "Preço de custo inválido." }, { status: 400 });
    }
    costPrice = c;
  }

  const pixPriceRaw = b.pixPrice;
  let pixPrice: number | null = null;
  if (pixPriceRaw != null && pixPriceRaw !== "") {
    const px = Number(pixPriceRaw);
    if (Number.isNaN(px) || px < 0) {
      return NextResponse.json(
        { error: "Valor no Pix inválido." },
        { status: 400 }
      );
    }
    pixPrice = px;
  }

  const videoUrl =
    typeof b.videoUrl === "string" && b.videoUrl.trim()
      ? b.videoUrl.trim()
      : null;

  const stockType =
    b.stockType === StockType.LIMITED ? StockType.LIMITED : StockType.UNLIMITED;
  let stockQuantity: number | null = null;
  if (stockType === StockType.LIMITED) {
    const q = Number(b.stockQuantity);
    stockQuantity =
      Number.isFinite(q) && q >= 0 ? Math.floor(q) : 0;
  }

  const visibleOnSite =
    b.visibleOnSite === false ||
    b.visibleOnSite === 0 ||
    b.visibleOnSite === "0" ||
    b.visibleOnSite === "false"
      ? false
      : true;

  const weightRaw = b.weightGrams;
  let weightGrams: number | null = null;
  if (weightRaw != null && weightRaw !== "") {
    const w = Number(weightRaw);
    if (Number.isNaN(w) || w < 0) {
      return NextResponse.json({ error: "Peso inválido." }, { status: 400 });
    }
    weightGrams = Math.round(w);
  }

  function optFloat(key: string): number | null {
    const v = b[key];
    if (v == null || v === "") return null;
    const n = Number(v);
    if (Number.isNaN(n) || n < 0) return null;
    return n;
  }

  const lengthCm = optFloat("lengthCm");
  const widthCm = optFloat("widthCm");
  const heightCm = optFloat("heightCm");

  const categoryIds = Array.isArray(b.categoryIds)
    ? b.categoryIds.filter((x): x is string => typeof x === "string")
    : [];

  if (categoryIds.length > 0) {
    const found = await prisma.category.findMany({
      where: { id: { in: categoryIds } },
    });
    if (found.length !== categoryIds.length) {
      return NextResponse.json(
        { error: "Uma ou mais categorias são inválidas." },
        { status: 400 }
      );
    }
  }

  const sectionIds = Array.isArray(b.sectionIds)
    ? b.sectionIds.filter((x): x is string => typeof x === "string")
    : [];

  if (sectionIds.length > 0) {
    const found = await prisma.section.findMany({
      where: { id: { in: sectionIds } },
    });
    if (found.length !== sectionIds.length) {
      return NextResponse.json(
        { error: "Uma ou mais seções são inválidas." },
        { status: 400 }
      );
    }
  }

  const imageCreates: { url: string; order: number; colorName: string | null }[] = [];
  for (let i = 0; i < images.length; i++) {
    const item = images[i] as { url?: unknown; colorName?: unknown };
    const url = typeof item?.url === "string" ? item.url.trim() : "";
    if (!url) {
      return NextResponse.json(
        { error: `Imagem na posição ${i + 1} precisa de uma URL válida.` },
        { status: 400 }
      );
    }
    const colorName = typeof item?.colorName === "string" && item.colorName.trim()
      ? item.colorName.trim()
      : null;
    imageCreates.push({ url, order: i, colorName });
  }

  const pieceCreates: {
    name: string;
    colors: { name: string; hex: string | null }[];
    sizes: { name: string }[];
    variants: { colorName: string; sizeName: string; quantity: number }[];
  }[] = [];

  for (let pi = 0; pi < piecesRaw.length; pi++) {
    const piece = piecesRaw[pi] as {
      name?: unknown;
      colors?: unknown;
      sizes?: unknown;
      variants?: unknown;
    };
    const pieceName =
      typeof piece?.name === "string" ? piece.name.trim() : "";
    if (!pieceName) continue;

    const colorsIn = Array.isArray(piece.colors) ? piece.colors : [];
    const sizesIn = Array.isArray(piece.sizes) ? piece.sizes : [];

    const colors: { name: string; hex: string | null }[] = [];
    for (const c of colorsIn) {
      const row = c as { name?: unknown; hex?: unknown };
      const cn = typeof row?.name === "string" ? row.name.trim() : "";
      if (!cn) continue;
      const hex =
        typeof row?.hex === "string" && row.hex.trim()
          ? row.hex.trim()
          : null;
      colors.push({ name: cn, hex });
    }

    const sizes: { name: string }[] = [];
    for (const s of sizesIn) {
      const row = s as { name?: unknown };
      const sn = typeof row?.name === "string" ? row.name.trim() : "";
      if (!sn) continue;
      sizes.push({ name: sn });
    }

    const variantsRaw = Array.isArray(piece.variants) ? piece.variants : [];
    const variants: {
      colorName: string;
      sizeName: string;
      quantity: number;
    }[] = [];
    for (const vr of variantsRaw) {
      const row = vr as {
        colorName?: unknown;
        sizeName?: unknown;
        quantity?: unknown;
      };
      const cn =
        typeof row.colorName === "string" ? row.colorName.trim() : "";
      const sn =
        typeof row.sizeName === "string" ? row.sizeName.trim() : "";
      if (!cn || !sn) continue;
      const q = Number(row.quantity);
      variants.push({
        colorName: cn,
        sizeName: sn,
        quantity: Number.isFinite(q) && q >= 0 ? Math.floor(q) : 0,
      });
    }

    pieceCreates.push({ name: pieceName, colors, sizes, variants });
  }

  try {
    const product = await prisma.$transaction(async (tx) => {
      const prod = await tx.product.create({
        data: {
          name: name.trim(),
          price: priceNum,
          installmentCount,
          pixPrice,
          costPrice,
          description:
            typeof b.description === "string" && b.description.trim()
              ? b.description.trim()
              : null,
          tag:
            typeof b.tag === "string" && b.tag.trim() ? b.tag.trim() : null,
          videoUrl,
          stockType,
          stockQuantity,
          visibleOnSite,
          weightGrams,
          lengthCm,
          widthCm,
          heightCm,
          ...(imageCreates.length > 0
            ? { images: { create: imageCreates } }
            : {}),
          categories:
            categoryIds.length > 0
              ? {
                  create: categoryIds.map((categoryId) => ({
                    category: { connect: { id: categoryId } },
                  })),
                }
              : undefined,
          sections:
            sectionIds.length > 0
              ? {
                  create: sectionIds.map((sectionId) => ({
                    section: { connect: { id: sectionId } },
                  })),
                }
              : undefined,
        },
      });

      for (const piece of pieceCreates) {
        const created = await tx.productPiece.create({
          data: {
            name: piece.name,
            productId: prod.id,
            ...(piece.colors.length > 0
              ? {
                  colors: {
                    create: piece.colors.map((c) => ({
                      name: c.name,
                      hex: c.hex,
                    })),
                  },
                }
              : {}),
            ...(piece.sizes.length > 0
              ? {
                  sizes: {
                    create: piece.sizes.map((s) => ({
                      name: s.name,
                    })),
                  },
                }
              : {}),
          },
          include: { colors: true, sizes: true },
        });

        for (const v of piece.variants) {
          const color = created.colors.find((c) => c.name === v.colorName);
          const size = created.sizes.find((s) => s.name === v.sizeName);
          if (!color || !size) continue;
          await insertPieceVariantRow(tx, {
            pieceId: created.id,
            colorId: color.id,
            sizeId: size.id,
            quantity: v.quantity,
          });
        }
      }

      return tx.product.findUniqueOrThrow({
        where: { id: prod.id },
        include: productFullInclude,
      });
    });

    return NextResponse.json(product, { status: 201 });
  } catch (error) {
    console.error("[POST /api/products]", error);

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      return NextResponse.json(
        {
          error: error.message,
          code: error.code,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Erro ao criar produto.",
      },
      { status: 500 }
    );
  }
}
