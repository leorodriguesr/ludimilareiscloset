import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Banner } from "@/components/Banner";
import { TrustBar } from "@/components/TrustBar";
import { ProductCard } from "@/components/ProductCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { SellerAssistBanner } from "@/components/SellerAssistBanner";
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
      prisma.category.findMany({ orderBy: { name: "asc" } }),
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

  return (
    <>
      <Banner
        imageUrl={settings?.bannerImageUrl ?? ""}
        mobileImageUrl={settings?.bannerMobileImageUrl ?? ""}
      />
      <TrustBar
        freeShippingEnabled={settings?.freeShippingEnabled ?? false}
        freeShippingType={settings?.freeShippingType ?? "minimum_value"}
        freeShippingMinValue={settings?.freeShippingMinValue ?? 0}
      />

      {/* Tab-bar de categorias — sticky abaixo do header */}
      {categories.length > 0 && (
        <Suspense fallback={null}>
          <CategoryFilter categories={categories} />
        </Suspense>
      )}

      <div id="produtos" className="w-full pb-20 pt-10 px-2">

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
            {filteredProducts.length > 0 ? <SellerAssistBanner /> : null}
          </div>
        ) : !hasTodosProducts ? (
          <EmptyState message="Nenhum produto disponível no momento." />
        ) : (
          <HomeCatalog
            sectionBlocks={sectionProductBlocks}
            unsectionedProducts={unsectionedProducts}
          />
        )}
      </div>
    </>
  );
}

function HomeCatalog({
  sectionBlocks,
  unsectionedProducts,
}: {
  sectionBlocks: { id: string; label: string; products: ProductCardData[] }[];
  unsectionedProducts: ProductCardData[];
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
    <div className="space-y-10">
      {blocks.map((block, index) => (
        <div key={block.key} className="space-y-10">
          <section>
            {block.label ? (
              <div className="mb-5">
                <SectionHeading label={block.label} />
              </div>
            ) : null}
            <ProductGrid>
              <ProductCards
                products={block.products}
                eagerCount={index === 0 ? 4 : 0}
              />
            </ProductGrid>
          </section>
          {index === 0 ? <SellerAssistBanner /> : null}
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
  pieces: { name: string; colors: { id: string; name: string; hex: string | null }[] }[];
};

function ProductCards({
  products,
  eagerCount = 0,
}: {
  products: ProductCardData[];
  eagerCount?: number;
}) {
  return (
    <>
      {products.map((product, index) => {
        const { pieceName, colors } = firstPieceColors(product.pieces);
        return (
          <ProductCard
            key={product.id}
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
          />
        );
      })}
    </>
  );
}

function SectionHeading({ label }: { label: string }) {
  return (
    <div className="mb-7 flex items-center gap-3">
      <span className="h-4 w-0.5 rounded-full bg-stone-900" />
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-800">
        {label}
      </h2>
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
