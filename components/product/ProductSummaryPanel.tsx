import Image from "next/image";
import { formatPrice } from "@/lib/format";
import { installmentValueEqualParts } from "@/lib/product-pricing";
import { ProductSummaryPurchaseClient } from "@/components/product/ProductSummaryPurchaseClient";
import { ProductPurchaseShippingSection } from "@/components/product/ProductPurchaseShippingSection";
import type { ProductPiece, StockType } from "@/lib/types";

export type ProductSummaryPanelProps = {
  productId: string;
  name: string;
  price: number;
  /** Valor no Pix (admin). Se ausente, o card Pix não é exibido. */
  pixPrice?: number | null;
  /** Parcelas sem juros (admin). Nulo = card “Cartão” só com preço. */
  installmentCount?: number | null;
  coverImage: string;
  stockType: StockType;
  stockQuantity: number | null;
  pieces: ProductPiece[];
};

function IconCard({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z"
      />
    </svg>
  );
}

export function ProductSummaryPanel({
  productId,
  name,
  price,
  pixPrice: pixPriceFromDb,
  installmentCount: installmentCountProp,
  coverImage,
  stockType,
  stockQuantity,
  pieces,
}: ProductSummaryPanelProps) {
  const showPixCard =
    pixPriceFromDb != null &&
    Number.isFinite(pixPriceFromDb) &&
    pixPriceFromDb > 0;
  const pixPrice = showPixCard ? pixPriceFromDb! : 0;
  const pixHint =
    showPixCard && price > 0 && pixPrice < price
      ? `${Math.max(0, Math.min(99, Math.round((1 - pixPrice / price) * 100)))}% em relação ao valor de referência`
      : null;

  const installments =
    installmentCountProp != null &&
    Number.isFinite(installmentCountProp) &&
    installmentCountProp >= 1 &&
    installmentCountProp <= 24
      ? Math.floor(installmentCountProp)
      : null;
  const showParcelamento = installments != null;
  const installmentEach =
    showParcelamento && installments != null
      ? installmentValueEqualParts(price, installments)
      : null;

  return (
    <section
      aria-labelledby="product-summary-title"
      className="relative min-w-0 overflow-hidden rounded-2xl border border-stone-200/90 bg-white shadow-[0_2px_32px_-8px_rgba(28,25,23,0.12)] ring-1 ring-stone-900/[0.04]"
    >
      <div
        className="pointer-events-none absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-stone-800 to-stone-900 sm:w-1"
        aria-hidden
      />
      <div className="pointer-events-none absolute -right-20 -top-20 h-56 w-56 rounded-full bg-stone-100/70 blur-3xl" aria-hidden />

      <div className="relative flex min-w-0 flex-col gap-8 px-4 py-7 pl-[1.125rem] sm:px-7 sm:py-8 sm:pl-9">
        <header className="space-y-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">
            Produto
          </p>
          <h1
            id="product-summary-title"
            className="text-balance text-2xl font-medium leading-[1.2] tracking-tight text-stone-900 sm:text-[1.75rem] sm:leading-tight"
          >
            {name}
          </h1>
        </header>

        <div className="space-y-3 border-b border-stone-100 pb-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">
            Valor
          </p>

          <div
            className={`mt-0 grid grid-cols-1 gap-3 ${showPixCard ? "sm:grid-cols-2" : ""}`}
          >
            {showPixCard && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5 sm:p-4">
                <div className="flex items-start gap-2.5">
                  <Image
                    src="/pix-icon.svg"
                    alt=""
                    width={18}
                    height={18}
                    unoptimized
                    className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 object-contain"
                  />
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-emerald-700">
                      Pix
                    </p>
                    <p className="mt-1 text-sm leading-snug text-emerald-900">
                      <span className="font-semibold tabular-nums text-lg">
                        {formatPrice(pixPrice)}
                      </span>{" "}
                      à vista
                    </p>
                    {pixHint && (
                      <p className="mt-1 text-[11px] text-emerald-700/90">
                        {pixHint}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div className="rounded-xl border border-stone-200/90 bg-gradient-to-b from-stone-50/90 to-white p-3.5 sm:p-4">
              <div className="flex items-start gap-2.5">
                <IconCard className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 text-stone-500" />
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-stone-500">
                    {showParcelamento ? "Parcelamento" : "Cartão"}
                  </p>
                  {showParcelamento && installments != null && installmentEach != null ? (
                    <>
                      <p className="mt-2 text-sm leading-snug text-stone-900">
                        <span className="font-semibold tabular-nums text-lg">
                          {formatPrice(price)}
                        </span>{" "}
                        ou
                      </p>
                      <p className="mt-1 text-sm leading-snug text-stone-900">
                        <span className="font-semibold">
                          {installments}x de{" "}
                          <span className="tabular-nums">
                            {formatPrice(installmentEach)}
                          </span>
                        </span>{" "}
                        sem juros
                      </p>
                    </>
                  ) : (
                    <p className="mt-2 text-sm leading-snug text-stone-900">
                      <span className="font-semibold tabular-nums text-lg">
                        {formatPrice(price)}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {pieces.length > 0 ? (
          <ProductSummaryPurchaseClient
            productId={productId}
            name={name}
            price={price}
            pixPrice={pixPriceFromDb ?? null}
            installmentCount={installmentCountProp ?? null}
            coverImage={coverImage}
            stockType={stockType}
            stockQuantity={stockQuantity}
            pieces={pieces}
          />
        ) : (
          <div className="space-y-4 border-t border-stone-100 pt-2">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">
              Sacola e envio
            </p>
            <ProductPurchaseShippingSection
              productId={productId}
              name={name}
              price={price}
              pixPrice={pixPriceFromDb ?? null}
              installmentCount={installmentCountProp ?? null}
              imageUrl={coverImage}
              stockType={stockType}
              stockQuantity={stockQuantity}
            />
          </div>
        )}
      </div>
    </section>
  );
}
