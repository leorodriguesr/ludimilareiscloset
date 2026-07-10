import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Banner } from "@/components/Banner";
import { TrustBar } from "@/components/TrustBar";
import { ProductCard } from "@/components/ProductCard";
import { CategoryFilter } from "@/components/CategoryFilter";
import { productListInclude } from "@/lib/product-include";

export const dynamic = "force-dynamic";

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
                include: {
                  product: { include: productListInclude },
                },
              },
            },
          }),
      categoryId
        ? prisma.product.findMany({
            where: { categories: { some: { categoryId } } },
            orderBy: { createdAt: "desc" },
            include: productListInclude,
          })
        : Promise.resolve([]),
      categoryId
        ? Promise.resolve([])
        : prisma.product.findMany({
            where: {
              NOT: {
                sections: {
                  some: { section: { isActive: true } },
                },
              },
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
          <section>
            <div className="">
              <SectionHeading label={activeCategory?.name ?? "Produtos"} />
            </div>
            {filteredProducts.length === 0 ? (
              <EmptyState message="Nenhum produto encontrado nesta categoria." />
            ) : (
              <ProductGrid>
                <ProductCards products={filteredProducts} />
              </ProductGrid>
            )}
          </section>
        ) : !hasTodosProducts ? (
          <EmptyState message="Nenhum produto disponível no momento." />
        ) : (
          <div className="space-y-10">
            {sectionProductBlocks.map((block) => (
              <section key={block.id}>
                <div className="mb-5">
                  <SectionHeading label={block.label} />
                </div>
                <ProductGrid>
                  <ProductCards products={block.products} />
                </ProductGrid>
              </section>
            ))}
            {unsectionedProducts.length > 0 && (
              <section>
                {sectionProductBlocks.length > 0 && (
                  <div className="mb-5">
                    <SectionHeading label="Produtos" />
                  </div>
                )}
                <ProductGrid>
                  <ProductCards products={unsectionedProducts} />
                </ProductGrid>
              </section>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function uniqueColors(pieces: { colors: { id: string; name: string; hex: string | null }[] }[]) {
  const seen = new Set<string>();
  return pieces.flatMap((p) => p.colors).filter((c) => {
    const key = c.hex ?? c.name;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

type ProductCardData = {
  id: string;
  name: string;
  price: number;
  pixPrice: number | null;
  installmentCount: number | null;
  images: { url: string; order: number; colorName: string | null }[];
  tag: string | null;
  pieces: { colors: { id: string; name: string; hex: string | null }[] }[];
};

function ProductCards({ products }: { products: ProductCardData[] }) {
  return (
    <>
      {products.map((product) => (
        <ProductCard
          key={product.id}
          id={product.id}
          name={product.name}
          price={product.price}
          pixPrice={product.pixPrice}
          installmentCount={product.installmentCount}
          images={product.images}
          tag={product.tag}
          colors={uniqueColors(product.pieces)}
        />
      ))}
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
