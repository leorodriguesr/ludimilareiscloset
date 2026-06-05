"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  useTransition,
} from "react";
import { placeOrderAction } from "@/app/checkout/actions";
import { useCart } from "@/components/cart/CartProvider";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import {
  CheckoutShippingSection,
  type CheckoutShippingSelection,
} from "@/components/checkout/CheckoutShippingSection";
import { GUEST_CHECKOUT_EMAIL_KEY } from "@/lib/checkout/guest-email-storage";
import { describeCartPieceSelection } from "@/lib/cart/format-piece-selections";
import { formatPrice } from "@/lib/format";
import { CHECKOUT_SHIPPING_AMOUNT_BRL } from "@/lib/config/checkout-shipping-charge";

type Props = {
  initialEmail: string;
  loggedIn: boolean;
};

export function CheckoutClient({ initialEmail, loggedIn }: Props) {
  const { items, hydrated, clear } = useCart();
  const [email, setEmail] = useState(initialEmail);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [shipping, setShipping] = useState<CheckoutShippingSelection | null>(
    null
  );

  const onShippingChange = useCallback(
    (s: CheckoutShippingSelection | null) => setShipping(s),
    []
  );

  useEffect(() => {
    if (loggedIn || typeof window === "undefined") return;
    try {
      const stored = window.sessionStorage.getItem(GUEST_CHECKOUT_EMAIL_KEY);
      if (stored?.trim()) {
        setEmail(stored.trim());
        window.sessionStorage.removeItem(GUEST_CHECKOUT_EMAIL_KEY);
      }
    } catch {
      /* private mode */
    }
  }, [loggedIn]);

  const lines = useMemo(
    () =>
      items.map((i) => ({
        lineId: i.lineId,
        productId: i.productId,
        quantity: i.quantity,
        name: i.name,
        price: i.price,
        image: i.image,
        pieceSelections: i.pieceSelections,
      })),
    [items]
  );

  const shippingLines = useMemo(
    () =>
      lines.map((l) => ({ productId: l.productId, quantity: l.quantity })),
    [lines]
  );

  const subtotalProducts = useMemo(() => {
    return lines.reduce((acc, l) => acc + l.price * l.quantity, 0);
  }, [lines]);

  const grandTotal = useMemo(
    () => subtotalProducts + CHECKOUT_SHIPPING_AMOUNT_BRL,
    [subtotalProducts]
  );

  const onSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();
      setError(null);

      if (lines.length === 0) {
        setError("Seu carrinho está vazio.");
        return;
      }

      if (!loggedIn && !email.trim()) {
        setError("Informe seu e-mail.");
        return;
      }

      if (!shipping) {
        setError("Informe o CEP e escolha uma opção de frete.");
        return;
      }

      startTransition(async () => {
        const res = await placeOrderAction({
          email: loggedIn ? undefined : email.trim(),
          lines: lines.map((l) => ({
            productId: l.productId,
            quantity: l.quantity,
            ...(l.pieceSelections?.length
              ? { pieceSelections: l.pieceSelections }
              : {}),
          })),
          shipping: {
            destinationCep: shipping.destinationCep,
            optionId: shipping.optionId,
          },
        });

        if (!res.ok) {
          setError(res.error);
          return;
        }

        clear();
        window.location.assign(res.checkoutUrl);
      });
    },
    [lines, loggedIn, email, shipping, clear]
  );

  if (!hydrated) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-sm text-stone-500">
        Carregando…
      </div>
    );
  }

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-stone-900">Checkout</h1>
        <p className="mt-3 text-sm text-stone-600">
          Seu carrinho está vazio.
        </p>
        <Link
          href="/"
          className="mt-8 inline-block rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-800 transition-colors"
        >
          Ver produtos
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-10">
      <h1 className="text-xl font-semibold text-stone-900">Checkout</h1>
      <p className="mt-1 text-sm text-stone-500">
        O frete cobrado no pagamento está em {formatPrice(CHECKOUT_SHIPPING_AMOUNT_BRL)}{" "}
        (testes; sem homologação). Transportadora e CEP continuam registrados. Ao
        confirmar, abre o checkout InfinitePay.
      </p>

      <form onSubmit={onSubmit} className="mt-8 space-y-8">
        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            Resumo
          </h2>
          <ul className="divide-y divide-stone-200 rounded-lg border border-stone-200">
            {lines.map((line) => (
              <li key={line.lineId} className="flex gap-3 p-3">
                <div className="relative h-16 w-14 shrink-0 overflow-hidden rounded bg-stone-100">
                  {line.image ? (
                    <Image
                      src={line.image}
                      alt=""
                      fill
                      className="object-cover"
                      sizes="56px"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-[9px] text-stone-400 px-0.5 text-center">
                      —
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-stone-900 truncate">
                    {line.name}
                  </p>
                  <p className="text-xs text-stone-500">
                    {line.quantity} × {formatPrice(line.price)}
                  </p>
                  {line.pieceSelections && line.pieceSelections.length > 0 && (
                    <ul className="mt-1.5 space-y-1">
                      {line.pieceSelections.map((row, idx) => {
                        const detail = describeCartPieceSelection(row);
                        if (!detail) return null;
                        return (
                          <li
                            key={`${row.pieceName}-${idx}`}
                            className="text-xs text-stone-600"
                          >
                            {line.pieceSelections!.length > 1 ? (
                              <>
                                <span className="font-medium text-stone-700">
                                  {row.pieceName}:{" "}
                                </span>
                                {detail}
                              </>
                            ) : (
                              detail
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
                <p className="text-sm font-medium tabular-nums text-stone-900">
                  {formatPrice(line.price * line.quantity)}
                </p>
              </li>
            ))}
          </ul>
          <div className="space-y-1 text-sm">
            <div className="flex justify-between">
              <span className="text-stone-600">Subtotal</span>
              <span className="tabular-nums text-stone-900">
                {formatPrice(subtotalProducts)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-stone-600">Frete (cobrado)</span>
              <span className="tabular-nums text-stone-900">
                {shipping
                  ? formatPrice(CHECKOUT_SHIPPING_AMOUNT_BRL)
                  : "—"}
              </span>
            </div>
            <div className="flex justify-between pt-1 border-t border-stone-200">
              <span className="text-stone-800 font-medium">Total</span>
              <span className="font-semibold text-stone-900 tabular-nums">
                {formatPrice(grandTotal)}
              </span>
            </div>
          </div>
        </section>

        <CheckoutShippingSection
          lines={shippingLines}
          onFulfillmentChange={onShippingChange}
        />

        <section className="space-y-3">
          <h2 className="text-xs font-semibold uppercase tracking-widest text-stone-500">
            Contato
          </h2>
          {loggedIn ? (
            <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2.5 text-sm text-stone-800">
              Pedido vinculado a <span className="font-medium">{email}</span>
            </p>
          ) : (
            <>
              <div>
                <label
                  htmlFor="checkout-email"
                  className="block text-xs text-stone-500 mb-1.5"
                >
                  E-mail
                </label>
                <input
                  id="checkout-email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-stone-900 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent"
                  placeholder="seu@email.com"
                />
              </div>
              <div className="pt-1">
                <GoogleSignInButton
                  nextPath="/checkout"
                  className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-300 bg-white py-2.5 text-sm font-medium text-stone-800 shadow-sm transition-colors hover:bg-stone-50"
                />
                <p className="mt-2 text-xs text-stone-500">
                  Se já tem conta, entre com Google para vincular o pedido.
                </p>
              </div>
            </>
          )}
        </section>

        {error && (
          <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
            {error}
          </p>
        )}

        <div className="flex flex-col gap-2 sm:flex-row sm:gap-3">
          <Link
            href="/"
            className="rounded-full border border-stone-300 px-5 py-2.5 text-center text-sm font-medium text-stone-800 hover:bg-stone-50 transition-colors"
          >
            Voltar à loja
          </Link>
          <button
            type="submit"
            disabled={pending}
            className="rounded-full bg-stone-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50 transition-colors"
          >
            {pending ? "Gerando pagamento…" : "Confirmar pedido"}
          </button>
        </div>
      </form>
    </div>
  );
}
