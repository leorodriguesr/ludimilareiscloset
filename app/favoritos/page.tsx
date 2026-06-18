import { redirect } from "next/navigation";
import Link from "next/link";
import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import { ProductCard } from "@/components/ProductCard";
import { productListInclude } from "@/lib/product-include";

export const dynamic = "force-dynamic";

export default async function FavoritosPage() {
  const session = await getAppSession();

  if (!session.user) {
    redirect("/login?next=/favoritos");
  }

  const favorites = await prisma.favorite.findMany({
    where: { userId: session.user.userId },
    orderBy: { createdAt: "desc" },
    include: {
      product: { include: productListInclude },
    },
  });

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-12 sm:px-6 md:px-8">
      <div className="mb-10 flex items-center gap-3">
        <span className="h-4 w-0.5 rounded-full bg-stone-900" />
        <h1 className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-800">
          Meus Favoritos
          {favorites.length > 0 && (
            <span className="ml-2 text-stone-400">({favorites.length})</span>
          )}
        </h1>
      </div>

      {favorites.length === 0 ? (
        <div className="flex flex-col items-center gap-6 py-24 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-stone-100">
            <svg className="h-8 w-8 text-stone-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z" />
            </svg>
          </span>
          <div>
            <p className="text-base font-medium text-stone-700">
              Nenhum favorito ainda
            </p>
            <p className="mt-1 text-sm text-stone-400">
              Clique no coração nos produtos para salvá-los aqui.
            </p>
          </div>
          <Link
            href="/"
            className="rounded-full bg-stone-900 px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800"
          >
            Explorar produtos
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-0.5 sm:grid-cols-3 lg:grid-cols-4">
          {favorites.map(({ product }) => (
            <ProductCard
              key={product.id}
              id={product.id}
              name={product.name}
              price={product.price}
              pixPrice={product.pixPrice}
              installmentCount={product.installmentCount}
              images={product.images}
              tag={product.tag}
            />
          ))}
        </div>
      )}
    </div>
  );
}
