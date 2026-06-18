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

  const pixDiscount =
    showPixCard && price > 0 && pixPrice < price
      ? Math.max(0, Math.min(99, Math.round((1 - pixPrice / price) * 100)))
      : null;

  return (
    <section aria-labelledby="product-summary-title" className="min-w-0">
      <div className="flex min-w-0 flex-col gap-4">
        {/* Nome */}
        <header>
          <h1
            id="product-summary-title"
            className="text-lg font-medium uppercase leading-tight text-stone-900 sm:text-xl"
          >
            {name}
          </h1>
        </header>

        {/* Preços */}
        <div className="space-y-1.5">
          {/* Preço normal */}
          <p className="text-base font-medium text-stone-700 ">
            {formatPrice(price)}
          </p>
          {showPixCard ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-emerald-600 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                {pixDiscount}% OFF NO PIX
              </span>
              <span className="text-2xl font-bold tabular-nums text-stone-900">
                {formatPrice(pixPrice)}
              </span>
              
            </div>
          ) : (
            <p className="text-2xl font-bold tabular-nums text-stone-900">
              {formatPrice(price)}
            </p>
          )}

          {showParcelamento && installments != null && installmentEach != null && (
            <div className="flex flex-wrap items-center gap-2">
              <span className="rounded bg-stone-900 px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
                {installments}x sem juros
              </span>
              <span className="text-sm text-stone-500">
                de{" "}
                <span className="font-semibold text-stone-800">
                  {formatPrice(installmentEach)}
                </span>
              </span>
            </div>
          )}
        </div>

        <div className="border-t border-stone-100" />

        {/* Peças / compra */}
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
        )}
      </div>
    </section>
  );
}
