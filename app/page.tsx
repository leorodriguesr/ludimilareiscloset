import { Suspense } from "react";
import { prisma } from "@/lib/prisma";
import { Banner } from "@/components/Banner";
import { ProductGrid } from "@/components/ProductGrid";
import { CategoryFilter } from "@/components/CategoryFilter";
import { productListInclude } from "@/lib/product-include";

export const dynamic = "force-dynamic";

interface HomeProps {
  searchParams: Promise<{ c?: string }>;
}

export default async function Home({ searchParams }: HomeProps) {
  const { c: categoryId } = await searchParams;

  const where = categoryId
    ? { categories: { some: { categoryId } } }
    : {};

  const [products, settings, categories] = await Promise.all([
    prisma.product.findMany({
      where,
      orderBy: { createdAt: "desc" },
      include: productListInclude,
    }),
    prisma.storeSettings.findUnique({ where: { id: "default" } }),
    prisma.category.findMany({ orderBy: { name: "asc" } }),
  ]);

  return (
    <>
      <Banner imageUrl={settings?.bannerImageUrl ?? ""} />

      <section className="mx-auto w-full min-w-0 max-w-7xl px-2 py-16 min-[401px]:px-3 sm:px-4 md:px-6">
        <div className="mb-6 text-center">
          <h2 className="text-xl font-light uppercase tracking-widest text-stone-900 min-[401px]:text-2xl">
            Nossos Produtos
          </h2>
          <div className="mt-3 mx-auto w-12 h-px bg-stone-300" />
        </div>

        <Suspense fallback={null}>
          <CategoryFilter categories={categories} />
        </Suspense>

        <ProductGrid products={products} />
      </section>
    </>
  );
}
