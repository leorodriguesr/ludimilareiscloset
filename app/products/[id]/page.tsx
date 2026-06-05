import { notFound } from "next/navigation";
import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { productFullInclude } from "@/lib/product-include";
import { ProductMediaGallery } from "@/components/product/ProductMediaGallery";
import { ProductSummaryPanel } from "@/components/product/ProductSummaryPanel";

interface ProductPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProductPage({ params }: ProductPageProps) {
  const { id } = await params;

  const product = await prisma.product.findUnique({
    where: { id },
    include: productFullInclude,
  });

  if (!product) notFound();

  const coverImage = product.images[0]?.url ?? "";

  return (
    <div className="mx-auto w-full min-w-0 max-w-7xl py-6 min-[401px]:py-8">
      <nav className="mb-8 min-w-0 px-2 text-sm text-stone-500 min-[401px]:px-3 sm:px-4 md:px-6">
        <Link href="/" className="hover:text-stone-900 transition-colors">
          Loja
        </Link>
        <span className="mx-2">/</span>
        <span className="break-words text-stone-900">{product.name}</span>
      </nav>

      <div className="grid min-w-0 items-stretch gap-8 min-[401px]:gap-10 lg:grid-cols-2 lg:gap-10 lg:px-6">
        <div className="relative min-w-0">
          <div className="lg:sticky lg:top-[calc(4rem+1.25rem)] lg:z-0">
            <ProductMediaGallery
              images={product.images}
              productName={product.name}
              videoUrl={product.videoUrl}
            />
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-8 px-2 min-[401px]:px-3 sm:px-4 md:px-6 lg:px-0">
          <ProductSummaryPanel
            productId={product.id}
            name={product.name}
            price={product.price}
            installmentCount={product.installmentCount}
            pixPrice={product.pixPrice}
            coverImage={coverImage}
            stockType={product.stockType}
            stockQuantity={product.stockQuantity}
            pieces={product.pieces}
          />

          {product.description && (
            <section aria-labelledby="desc-heading" className="space-y-3">
              <h2
                id="desc-heading"
                className="text-xs font-semibold uppercase tracking-[0.2em] text-stone-500"
              >
                Descrição
              </h2>
              <div className="rounded-xl border border-stone-100 bg-stone-50/40 px-4 py-4 sm:px-5">
                <p className="text-[15px] leading-[1.65] text-stone-700 whitespace-pre-line">
                  {product.description}
                </p>
              </div>
            </section>
          )}

          <section
            aria-label="Benefícios da loja"
            className="rounded-xl border border-stone-200 bg-gradient-to-b from-stone-50/80 to-white p-4 sm:p-5"
          >
            <ul className="grid gap-3 sm:grid-cols-3">
              <li className="flex gap-3 rounded-lg border border-stone-100 bg-white/90 px-3 py-3 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"
                    />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-stone-900">
                    Envio nacional
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-stone-500">
                    Entregas em todo o Brasil
                  </span>
                </span>
              </li>
              <li className="flex gap-3 rounded-lg border border-stone-100 bg-white/90 px-3 py-3 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                    />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-stone-900">
                    Curadoria
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-stone-500">
                    Peças selecionadas com cuidado
                  </span>
                </span>
              </li>
              <li className="flex gap-3 rounded-lg border border-stone-100 bg-white/90 px-3 py-3 shadow-sm">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-600">
                  <svg
                    className="h-4 w-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.5}
                      d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
                    />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-stone-900">
                    Pagamento seguro
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-stone-500">
                    Checkout protegido
                  </span>
                </span>
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}
