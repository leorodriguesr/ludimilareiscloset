import { formatPrice } from "@/lib/format";
import {
  installmentValueEqualParts,
  PIX_DISCOUNT_PERCENT,
  priceWithPixDiscount,
  SHOWCASE_INSTALLMENTS,
} from "@/lib/product-pricing";
import { PieceSelector } from "@/components/product/PieceSelector";
import { ProductPurchaseShippingSection } from "@/components/product/ProductPurchaseShippingSection";
import type { ProductPiece, StockType } from "@/lib/types";

export type ProductSummaryPanelProps = {
  productId: string;
  name: string;
  price: number;
  coverImage: string;
  stockType: StockType;
  stockQuantity: number | null;
  pieces: ProductPiece[];
};

function IconPix({ className }: { className?: string }) {
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
        d="M13 10V3L4 14h7v7l9-11h-7z"
      />
    </svg>
  );
}

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

function IconMoney({ className }: { className?: string }) {
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
        d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 5.25v9m14.25-9v9m-14 0h14.75A2.25 2.25 0 0021 12.75v-7.5A2.25 2.25 0 0018.75 3H5.25A2.25 2.25 0 003 5.25v7.5A2.25 2.25 0 005.25 15z"
      />
    </svg>
  );
}

export function ProductSummaryPanel({
  productId,
  name,
  price,
  coverImage,
  stockType,
  stockQuantity,
  pieces,
}: ProductSummaryPanelProps) {
  const pixPrice = priceWithPixDiscount(price);
  const installment = installmentValueEqualParts(price, SHOWCASE_INSTALLMENTS);

  const payRows = [
    {
      key: "pix",
      icon: IconPix,
      body: (
        <>
          <span className="font-semibold tabular-nums text-stone-900">
            {formatPrice(pixPrice)}
          </span>
          <span className="text-stone-600"> com Pix</span>
        </>
      ),
      hint: "Aprovação na hora",
    },
    {
      key: "card",
      icon: IconCard,
      body: (
        <>
          <span className="font-semibold text-stone-900">
            {SHOWCASE_INSTALLMENTS} x de{" "}
            <span className="tabular-nums">{formatPrice(installment)}</span>
          </span>
          <span className="text-stone-600"> sem juros</span>
        </>
      ),
      hint: "No cartão",
    },
    {
      key: "discount",
      icon: IconMoney,
      body: (
        <>
          <span className="font-semibold text-emerald-800">
            {PIX_DISCOUNT_PERCENT}% de desconto
          </span>
          <span className="text-stone-600"> pagando com Pix</span>
        </>
      ),
      hint: "Em relação ao preço principal",
    },
  ] as const;

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
            Preço
          </p>
          <p className="text-3xl font-semibold tabular-nums tracking-tight text-stone-900 sm:text-[2rem]">
            {formatPrice(price)}
          </p>
          <p className="max-w-md text-xs leading-relaxed text-stone-500">
            Valor de referência. Condições especiais de Pix e parcelamento
            abaixo.
          </p>

          <div className="mt-5 overflow-hidden rounded-xl border border-stone-200/90 bg-gradient-to-b from-stone-50/90 to-white">
            <ul className="divide-y divide-stone-100/90">
              {payRows.map(({ key, icon: Icon, body, hint }) => (
                <li
                  key={key}
                  className="flex gap-3 px-3.5 py-3.5 sm:gap-3.5 sm:px-4 sm:py-4"
                >
                  <Icon className="mt-0.5 h-[1.125rem] w-[1.125rem] shrink-0 text-stone-500" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-snug text-stone-800">{body}</p>
                    <p className="mt-1 text-[11px] text-stone-400">{hint}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>

        {pieces.length > 0 && (
          <div className="space-y-3">
            <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">
              Opções
            </p>
            <PieceSelector pieces={pieces} />
          </div>
        )}

        <div className="space-y-4 border-t border-stone-100 pt-2">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-400">
            Sacola e envio
          </p>
          <ProductPurchaseShippingSection
            productId={productId}
            name={name}
            price={price}
            imageUrl={coverImage}
            stockType={stockType}
            stockQuantity={stockQuantity}
          />
        </div>
      </div>
    </section>
  );
}
