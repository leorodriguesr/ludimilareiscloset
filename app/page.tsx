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

  const [sections, filteredProducts, settings, categories] = await Promise.all([
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
    prisma.storeSettings.findUnique({ where: { id: "default" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  const activeCategory = categories.find((c) => c.id === categoryId);

  return (
    <>
      <Banner imageUrl={settings?.bannerImageUrl ?? ""} />
      <TrustBar />

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
                {filteredProducts.map((product) => (
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
              </ProductGrid>
            )}
          </section>
        ) : sections.length === 0 ? (
          <EmptyState message="Nenhum produto disponível no momento." />
        ) : (
          <div className="space-y-10">
            {sections.map((section) => {
              const products = section.products.map((ps) => ps.product);
              if (products.length === 0) return null;
              return (
                <section key={section.id}>
                  <div className="mb-5 ">
                    <SectionHeading label={section.name} />
                  </div>
                  <ProductGrid>
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
                  </ProductGrid>
                </section>
              );
            })}
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
