import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Banner } from "@/components/Banner";
import { ShowcaseVideos } from "@/components/ShowcaseVideos";
import { ProductCard } from "@/components/ProductCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { HomeCategoryShowcase } from "@/components/HomeCategoryShowcase";
import { HomeMarquee } from "@/components/HomeMarquee";
import { SellerAssistBanner } from "@/components/SellerAssistBanner";
import { formatPrice } from "@/lib/format";
import { productListInclude } from "@/lib/product-include";
import { publicCatalogProductWhere } from "@/lib/public-product-where";
import { isSizeOnlyColorName } from "@/lib/piece-size-only-color";

export const revalidate = 60;

interface HomeProps {
  searchParams: Promise<{ c?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { c: categoryId } = await searchParams;

  const [sections, filteredProducts, unsectionedProducts, settings, categories] =
    await Promise.all([
      categoryId
        ? Promise.resolve([])
        : prisma.section.findMany({
            where: { isActive: true },
            orderBy: { order: "asc" },
            include: {
              products: {
                where: { product: publicCatalogProductWhere },
                orderBy: [{ sortOrder: "asc" }, { product: { createdAt: "desc" } }],
                include: {
                  product: { include: productListInclude },
                },
              },
            },
          }),
      categoryId
        ? prisma.product.findMany({
            where: {
              AND: [
                publicCatalogProductWhere,
                { categories: { some: { categoryId } } },
              ],
            },
            orderBy: { createdAt: "desc" },
            include: productListInclude,
          })
        : Promise.resolve([]),
      categoryId
        ? Promise.resolve([])
        : prisma.product.findMany({
            where: {
              AND: [
                publicCatalogProductWhere,
                {
                  NOT: {
                    sections: {
                      some: { section: { isActive: true } },
                    },
                  },
                },
              ],
            },
            orderBy: { createdAt: "desc" },
            include: productListInclude,
          }),
      prisma.storeSettings.findUnique({ where: { id: "default" } }),
      prisma.category.findMany({
        orderBy: [{ order: "asc" }, { name: "asc" }],
        include: {
          products: {
            where: { product: publicCatalogProductWhere },
            take: 4,
            orderBy: { product: { createdAt: "desc" } },
            select: {
              product: {
                select: {
                  images: {
                    orderBy: { order: "asc" },
                    take: 4,
                    select: { url: true },
                  },
                },
              },
            },
          },
        },
      }),
    ]);

  const activeCategory = categories.find((c) => c.id === categoryId);

  const sectionProductBlocks = sections
    .map((section) => ({
      id: section.id,
      label: section.name,
      products: section.products.map((ps) => ps.product),
    }))
    .filter((block) => block.products.length > 0);

  const hasTodosProducts =
    sectionProductBlocks.length > 0 || unsectionedProducts.length > 0;
  const usedCategoryImages = new Set<string>();
  const categoryShowcaseItems = categories.slice(0, 4).map((category) => {
    const candidates = category.products
      .flatMap((item) => item.product.images.map((image) => image.url))
      .filter((url): url is string => Boolean(url));
    const imageUrl =
      category.coverImageUrl ||
      candidates.find((url) => !usedCategoryImages.has(url)) ||
      candidates[0] ||
      null;
    if (imageUrl) usedCategoryImages.add(imageUrl);

    return {
      id: category.id,
      name: category.name,
      imageUrl,
    };
  });

  const shippingMessage = settings?.freeShippingEnabled
    ? settings.freeShippingType === "always" || !(settings.freeShippingMinValue > 0)
      ? "Frete grátis em todos os pedidos"
      : `Frete grátis em compras acima de ${formatPrice(settings.freeShippingMinValue)}`
    : "Frete calculado no checkout";

  return (
    <>
      <HomeMarquee
        messages={[
          shippingMessage,
          "Troca fácil",
          "Parcele em até 6x sem juros",
        ]}
      />
      <Banner
        imageUrl={settings?.bannerImageUrl ?? ""}
        mobileImageUrl={settings?.bannerMobileImageUrl ?? ""}
      />
      <ShowcaseVideos />

      {/* Tab-bar de categorias — sticky abaixo do header */}
      {categories.length > 0 && (
        <Suspense fallback={null}>
          <CategoryFilter categories={categories} />
        </Suspense>
      )}

      <div id="produtos" className="w-full scroll-mt-28 px-2 pb-20 pt-12 sm:px-4 sm:pt-16">

        {/* Vista por categoria */}
        {categoryId ? (
          <div className="space-y-10">
            <section>
              <div className="">
                <SectionHeading label={activeCategory?.name ?? "Produtos"} />
              </div>
              {filteredProducts.length === 0 ? (
                <EmptyState message="Nenhum produto encontrado nesta categoria." />
              ) : (
                <ProductGrid>
                  <ProductCards products={filteredProducts} eagerCount={4} />
                </ProductGrid>
              )}
            </section>
            {filteredProducts.length > 0 ? (
              <SellerAssistBanner />
            ) : null}
          </div>
        ) : !hasTodosProducts ? (
          <EmptyState message="Nenhum produto disponível no momento." />
        ) : (
          <HomeCatalog
            sectionBlocks={sectionProductBlocks}
            unsectionedProducts={unsectionedProducts}
            categories={categoryShowcaseItems}
          />
        )}
      </div>
    </>
  );
}

function HomeCatalog({
  sectionBlocks,
  unsectionedProducts,
  categories,
}: {
  sectionBlocks: { id: string; label: string; products: ProductCardData[] }[];
  unsectionedProducts: ProductCardData[];
  categories: { id: string; name: string; imageUrl: string | null }[];
}) {
  const blocks: { key: string; label: string | null; products: ProductCardData[] }[] =
    [
      ...sectionBlocks.map((b) => ({
        key: b.id,
        label: b.label,
        products: b.products,
      })),
      ...(unsectionedProducts.length > 0
        ? [
            {
              key: "unsectioned",
              label: sectionBlocks.length > 0 ? "Produtos" : null,
              products: unsectionedProducts,
            },
          ]
        : []),
    ];

  return (
    <div className="space-y-16">
      {blocks.map((block, index) => (
        <div key={block.key} className="space-y-16">
          <section>
            {block.label ? <SectionHeading label={block.label} /> : null}
            <ProductGrid>
              <ProductCards
                products={block.products}
                eagerCount={index === 0 ? 4 : 0}
              />
            </ProductGrid>
          </section>
          {index === 0 && categories.length > 0 ? (
            <div className="-mx-2 sm:-mx-4">
              <HomeCategoryShowcase categories={categories} />
            </div>
          ) : null}
          {index === 1 ? <SellerAssistBanner /> : null}
        </div>
      ))}
    </div>
  );
}

/** Cores da listagem = só a primeira peça do produto. */
function firstPieceColors(
  pieces: { name: string; colors: { id: string; name: string; hex: string | null }[] }[]
): {
  pieceName: string | null;
  colors: { id: string; name: string; hex: string | null }[];
} {
  const first = pieces[0];
  if (!first) return { pieceName: null, colors: [] };
  const colors = first.colors.filter((c) => !isSizeOnlyColorName(c.name));
  return { pieceName: first.name.trim() || null, colors };
}

type ProductCardData = {
  id: string;
  name: string;
  price: number;
  pixPrice: number | null;
  installmentCount: number | null;
  images: { url: string; order: number; colorName: string | null }[];
  tag: string | null;
  allowBackorder: boolean;
  pieces: {
    name: string;
    colors: { id: string; name: string; hex: string | null }[];
    variants: { quantity: number; unlimited: boolean }[];
  }[];
};

function ProductCards({
  products,
  eagerCount = 0,
  itemClassName,
}: {
  products: ProductCardData[];
  eagerCount?: number;
  itemClassName?: string;
}) {
  return (
    <>
      {products.map((product, index) => {
        const { pieceName, colors } = firstPieceColors(product.pieces);
        const variants = product.pieces.flatMap((piece) => piece.variants);
        const backorderOnly =
          product.allowBackorder &&
          variants.length > 0 &&
          variants.every(
            (variant) => !variant.unlimited && variant.quantity <= 0
          );
        return (
          <div key={product.id} className={itemClassName}>
            <ProductCard
              priority={index < eagerCount}
              id={product.id}
              name={product.name}
              price={product.price}
              pixPrice={product.pixPrice}
              installmentCount={product.installmentCount}
              images={product.images}
              tag={product.tag}
              colors={colors}
              colorPieceName={pieceName}
              backorderOnly={backorderOnly}
            />
          </div>
        );
      })}
    </>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <div className="mb-7 flex items-center gap-3">
      <span className="h-[2px] w-7 shrink-0 rounded-full bg-[#B5838D]" aria-hidden />
      <h2 className="shrink-0 text-xs font-semibold uppercase tracking-[0.2em] text-[#B5838D]">
        {label}
      </h2>
      <span className="h-px flex-1 bg-[#B5838D]" aria-hidden />
    </div>
  );
}

function ProductGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
      {children}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="py-20 text-center">
      <p className="text-sm text-stone-400">{message}</p>
    </div>
  );
}
