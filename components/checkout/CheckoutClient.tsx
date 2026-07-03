"use client";

import React from "react";
import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { placeOrderAction, updateUserCheckoutContactAction } from "@/app/checkout/actions";
import { useCart } from "@/components/cart/CartProvider";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { GUEST_CHECKOUT_EMAIL_KEY } from "@/lib/checkout/guest-email-storage";
import { describeCartPieceSelection } from "@/lib/cart/format-piece-selections";
import { formatPrice } from "@/lib/format";
import { installmentValueEqualParts } from "@/lib/product-pricing";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import type { CartPieceSelection } from "@/lib/cart/types";
import { useStoreSettings } from "@/lib/hooks/use-store-settings";
import { checkFreeShipping } from "@/lib/shipping/free-shipping";

// ─── Types ────────────────────────────────────────────────────────────────────

type Props = { initialEmail: string; initialName: string; initialPhone: string; initialCpf: string; loggedIn: boolean };
type ContactData = { name: string; email: string; phone: string; cpf: string };
type ShippingData = {
  cep: string; street: string; number: string; complement: string;
  neighborhood: string; city: string; state: string;
  optionId: string; optionLabel: string; optionPrice: number; deliveryLabel: string;
  /** True quando a opção selecionada é a mais barata e o carrinho tem frete grátis. */
  optionIsFree?: boolean;
};
type PaymentMethod = "pix" | "card" | null;
type PixData = {
  orderId: string;
  pixCode: string;
  pixQrBase64: string | null;
  expiresAt: string;
  amount: number;
};
type CartLine = {
  lineId: string; productId: string; name: string; image: string | null;
  quantity: number; price: number; pixPrice?: number | null; installmentCount?: number | null;
  pieceSelections?: CartPieceSelection[];
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const onlyDigits = (s: string) => s.replace(/\D/g, "").slice(0, 8);
const cepMask = (d: string) => d.length <= 5 ? d : `${d.slice(0, 5)}-${d.slice(5)}`;
const phoneFmt = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 2) return d;
  if (d.length <= 7) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
};
const cpfFmt = (v: string) => {
  const d = v.replace(/\D/g, "").slice(0, 11);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `${d.slice(0, 3)}.${d.slice(3)}`;
  if (d.length <= 9) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6)}`;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
};
const daysLabel = (o: NormalizedShippingOption) => {
  const { deliveryDaysMin: a, deliveryDaysMax: b } = o;
  if (a <= 0 && b <= 0) return "Prazo sob consulta";
  return a === b ? `${a} dia(s) útil(is)` : `${a}–${b} dias úteis`;
};
function rankHighlights(opts: NormalizedShippingOption[]) {
  if (!opts.length) return { cheapestIds: new Set<string>(), fastestIds: new Set<string>() };
  const minP = Math.min(...opts.map((o) => o.price));
  const cheapestIds = new Set(opts.filter((o) => o.price === minP).map((o) => o.id));
  const known = opts.filter((o) => o.deliveryDaysMin > 0 || o.deliveryDaysMax > 0);
  if (!known.length) return { cheapestIds, fastestIds: new Set<string>() };
  const sc = (o: NormalizedShippingOption) =>
    o.deliveryDaysMin > 0 ? o.deliveryDaysMin * 1000 + o.deliveryDaysMax : o.deliveryDaysMax * 1000;
  const best = Math.min(...known.map(sc));
  return { cheapestIds, fastestIds: new Set(known.filter((o) => sc(o) === best).map((o) => o.id)) };
}

const inputCls = "w-full rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm placeholder:text-stone-300 transition-colors focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900";

function ShippingPriceSummary({
  price,
  qualifiesForFreeShipping,
  size = "sm",
}: {
  price: number;
  qualifiesForFreeShipping: boolean;
  size?: "sm" | "base";
}) {
  const priceCls = size === "base" ? "text-base font-bold" : "text-sm font-semibold";
  if (qualifiesForFreeShipping) {
    return (
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        {price > 0 && (
          <span className="text-xs tabular-nums text-stone-400 line-through">{formatPrice(price)}</span>
        )}
        <span className={`${priceCls} text-emerald-600`}>Grátis</span>
      </div>
    );
  }
  return (
    <span className={`shrink-0 tabular-nums ${priceCls} ${price === 0 ? "text-emerald-600" : "text-stone-900"}`}>
      {price === 0 ? "Grátis" : formatPrice(price)}
    </span>
  );
}

// ─── Step progress bar ────────────────────────────────────────────────────────

const STEPS = ["Contato", "Entrega", "Pagamento"];

function StepBar({ current }: { current: number }) {
  return (
    <ol className="flex items-start">
      {STEPS.map((label, i) => {
        const n = i + 1;
        const done = current > n;
        const active = current === n;
        return (
          <li key={n} className="flex flex-1 flex-col items-center">
            <div className="relative flex w-full items-center">
              <div className={`h-px flex-1 ${i === 0 ? "opacity-0" : done || active ? "bg-stone-900" : "bg-stone-200"} transition-colors duration-500`} />
              <div className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[11px] font-bold transition-all duration-300 ${done ? "border-stone-900 bg-stone-900 text-white" : active ? "border-stone-900 bg-white text-stone-900" : "border-stone-200 bg-white text-stone-400"}`}>
                {done
                  ? <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={3} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                  : n}
              </div>
              <div className={`h-px flex-1 ${i === STEPS.length - 1 ? "opacity-0" : done ? "bg-stone-900" : "bg-stone-200"} transition-colors duration-500`} />
            </div>
            <span className={`mt-1.5 text-[10px] font-semibold uppercase tracking-wider ${active ? "text-stone-900" : done ? "text-stone-500" : "text-stone-300"} transition-colors`}>
              {label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

// ─── Mobile order summary (collapsible top bar) ───────────────────────────────

function MobileOrderSummary({ lines, subtotal, subtotalPix }: { lines: CartLine[]; subtotal: number; subtotalPix: number }) {
  const [open, setOpen] = useState(false);
  const totalQty = lines.reduce((a, l) => a + l.quantity, 0);
  const maxInstallments = lines.reduce((acc, l) => {
    const n = l.installmentCount ?? 0;
    return n > acc ? n : acc;
  }, 0) || 6;
  const cardInstallmentValue = installmentValueEqualParts(subtotal, maxInstallments);
  return (
    <div className="border-b border-stone-200 bg-white lg:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4"
      >
        <div className="flex items-center gap-2.5 text-sm font-medium text-stone-700 w-full">
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-stone-900 text-[10px] font-bold text-white">
            {totalQty}
          </span>
          Ver resumo do pedido
          <svg className={`ml-auto h-4 w-4 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
        {/* <div className="flex shrink-0 flex-col items-end gap-1 text-right">
          <div className="flex items-center gap-1.5">
            <Image src="/pix-icon.svg" alt="" width={14} height={14} unoptimized className="h-3.5 w-3.5 shrink-0 object-contain" />
            <span className="text-sm font-bold tabular-nums text-stone-900">{formatPrice(subtotalPix)}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <svg className="h-3.5 w-3.5 shrink-0 text-stone-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span className="text-sm font-bold tabular-nums text-stone-900">{formatPrice(subtotal)}</span>
          </div>
        </div> */}
      </button>

      {open && (
        <div className="border-t border-stone-100 px-5 pb-5 pt-3">
          <ul className="space-y-3">
            {lines.map((l) => {
              const lineCard = l.price * l.quantity;
              const linePix = l.pixPrice != null && l.pixPrice > 0 ? l.pixPrice * l.quantity : null;
              const inst = (() => {
                const parts = Math.floor(l.installmentCount ?? 0);
                if (parts < 1) return null;
                return { parts, each: installmentValueEqualParts(l.price * l.quantity, parts) };
              })();
              return (
              <li key={l.lineId} className="flex gap-3">
                <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded-md bg-stone-100">
                  {l.image
                    ? <Image src={l.image} alt="" fill className="object-cover" sizes="48px" />
                    : <div className="flex h-full items-center justify-center text-[9px] text-stone-400">—</div>}
                  {l.quantity > 1 && (
                    <span className="absolute -right-1.5 -top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-stone-900 text-[9px] font-bold text-white">
                      {l.quantity}
                    </span>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-stone-900">{l.name}</p>
                  {l.pieceSelections?.map((r, i) => {
                    const d = describeCartPieceSelection(r);
                    return d ? <p key={i} className="text-xs text-stone-500">{d}</p> : null;
                  })}
                  <p className="mt-1 text-xs text-stone-400 tabular-nums">{l.quantity} × {formatPrice(l.price)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                  {linePix != null && (
                    <div className="flex items-start gap-1.5">
                      <Image src="/pix-icon.svg" alt="" width={14} height={14} unoptimized className="mt-0.5 h-3.5 w-3.5 shrink-0 object-contain" />
                      <div>
                        <p className="text-[12px] tabular-nums text-stone-500">{formatPrice(linePix)}</p>
                        {/* <p className="text-[10px] text-stone-400">à vista</p> */}
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-1.5">
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-400" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <div>
                      <p className="text-[12px] tabular-nums text-stone-500">{formatPrice(lineCard)}</p>
                      {/* {inst && <p className="text-[10px] tabular-nums text-stone-400">{inst.parts}× {formatPrice(inst.each)}</p>} */}
                    </div>
                  </div>
                </div>
              </li>
              );
            })}
          </ul>
          <div className="mt-4 space-y-2 border-t border-stone-100 pt-3 text-sm">
            <div className="flex items-center justify-between gap-3 text-stone-600">
              <span className="flex items-center gap-1.5">
                <Image src="/pix-icon.svg" alt="" width={16} height={16} unoptimized className="h-4 w-4 shrink-0 object-contain" />
                Subtotal Pix
              </span>
              <span className="font-semibold tabular-nums text-emerald-700">{formatPrice(subtotalPix)}</span>
            </div>
            <div className="flex items-start justify-between gap-3 text-stone-600">
              <span className="flex items-center gap-1.5">
                <svg className="h-4 w-4 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                </svg>
                Subtotal Cartão
              </span>
              <div className="text-right">
                <span className="font-semibold tabular-nums text-stone-900">{formatPrice(subtotal)}</span>
                <p className="text-[10px] tabular-nums text-stone-400">{maxInstallments}× {formatPrice(cardInstallmentValue)} s/ juros</p>
              </div>
            </div>
            <p className="text-[11px] text-stone-400">+ frete calculado na próxima etapa</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Desktop right summary panel ──────────────────────────────────────────────

function DesktopSummary({
  lines, shipping, deliveryDone, subtotal, subtotalPix,
  step, paymentMethod, onPay, pending,
}: {
  lines: CartLine[]; shipping: ShippingData;
  deliveryDone: boolean; subtotal: number; subtotalPix: number;
  step: number; paymentMethod: PaymentMethod; onPay: () => void; pending: boolean;
}) {
  const canPay = step === 3 && paymentMethod !== null;
  const { settings } = useStoreSettings();
  const qualifiesForFreeShipping = settings
    ? checkFreeShipping(settings, subtotal).isFree
    : false;
  const showShippingAsFree = Boolean(shipping.optionIsFree);

  // Frete não é cobrado no pagamento — R$0 sempre para totais
  const effectiveShipping = 0;

  // Max installments across all items (fallback 6)
  const maxInstallments = lines.reduce((acc, l) => {
    const n = l.installmentCount ?? 0;
    return n > acc ? n : acc;
  }, 0) || 6;
  const cardInstallmentValue = installmentValueEqualParts(subtotal, maxInstallments);

  return (
    <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
      {/* Header */}
      <div className="border-b border-stone-200 px-5 py-4">
        <h2 className="text-base font-semibold text-stone-900">Resumo do pedido</h2>
      </div>

      {/* Items — styled like CartDrawer, with pix + card prices */}
      <div className="px-5 py-4">
        <ul className="divide-y divide-stone-200">
          {lines.map((l) => {
            const lineCard = l.price * l.quantity;
            const linePix = l.pixPrice != null && l.pixPrice > 0 ? l.pixPrice * l.quantity : null;
            const inst = (() => {
              const parts = Math.floor(l.installmentCount ?? 0);
              if (parts < 1) return null;
              return { parts, each: installmentValueEqualParts(l.price * l.quantity, parts) };
            })();
            return (
              <li key={l.lineId} className="flex gap-3 py-4 first:pt-0 last:pb-0">
                <div className="relative h-20 w-16 shrink-0 overflow-hidden rounded-md bg-stone-100">
                  {l.image
                    ? <Image src={l.image} alt="" fill className="object-cover" sizes="64px" />
                    : <div className="flex h-full items-center justify-center text-[9px] text-stone-400 px-1 text-center">Sem foto</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-stone-900">{l.name}</p>
                  {l.pieceSelections?.map((r, i) => {
                    const d = describeCartPieceSelection(r);
                    return d ? <p key={i} className="mt-0.5 text-xs text-stone-500">{d}</p> : null;
                  })}
                  <p className="mt-1 text-xs text-stone-400 tabular-nums">{l.quantity} × {formatPrice(l.price)}</p>
                </div>
                {/* Prices column: Pix + Card */}
                <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                  {linePix != null && (
                    <div className="flex items-start gap-1.5">
                      <Image src="/pix-icon.svg" alt="" width={14} height={14} unoptimized className="mt-0.5 h-3.5 w-3.5 shrink-0 object-contain" />
                      <div>
                        <p className="text-[12px] tabular-nums text-stone-500">{formatPrice(linePix)}</p>
                        <p className="text-[10px] text-stone-400">à vista</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-1.5">
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <div>
                      <p className="text-[12px] tabular-nums text-stone-500">{formatPrice(lineCard)}</p>
                      {inst && <p className="text-[10px] tabular-nums text-stone-400">{inst.parts}× {formatPrice(inst.each)}</p>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Shipping section */}
      <div className="border-t border-stone-200 px-5 py-4">
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Frete</p>
        {deliveryDone && shipping.optionLabel ? (
          <div className="flex items-start justify-between gap-2">
            <p className="text-sm text-stone-600">{shipping.optionLabel}</p>
            <ShippingPriceSummary
              price={shipping.optionPrice}
              qualifiesForFreeShipping={showShippingAsFree}
            />
          </div>
        ) : (
          <p className="text-sm text-stone-400">Calculado na etapa de entrega</p>
        )}
        {settings && !qualifiesForFreeShipping && settings.freeShippingEnabled && (() => {
          const fs = checkFreeShipping(settings, subtotal);
          if (fs.missingAmount == null) return null;
          return (
            <p className="mt-2 text-xs text-stone-500">
              Falta <span className="font-semibold text-stone-700">{formatPrice(fs.missingAmount)}</span> para frete grátis
            </p>
          );
        })()}
      </div>

      {/* Total by payment method — only on step 3 */}
      {step === 3 && (
        <div className="border-t border-stone-200 bg-stone-50 px-5 py-4">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Total a pagar</p>
          {paymentMethod === null && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-3">
              <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              <p className="text-sm text-amber-700">Selecione a forma de pagamento</p>
            </div>
          )}
          {paymentMethod === "pix" && (
            <div className="rounded-lg bg-stone-100 px-4 py-3 ring-1 ring-stone-200">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Image src="/pix-icon.svg" alt="Pix" width={16} height={16} unoptimized className="h-4 w-4 shrink-0 object-contain" />
                  <span className="text-sm font-medium text-stone-700">Pix · à vista</span>
                </div>
                <span className="text-lg font-bold tabular-nums text-stone-900">
                  {formatPrice(subtotalPix + effectiveShipping)}
                </span>
              </div>
            </div>
          )}
          {paymentMethod === "card" && (
            <div className="rounded-lg bg-stone-100 px-4 py-3 ring-1 ring-stone-200">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <span className="text-sm font-medium text-stone-700">Cartão de crédito</span>
                </div>
                <span className="text-lg font-bold tabular-nums text-stone-900">
                  {formatPrice(subtotal + effectiveShipping)}
                </span>
              </div>
              <p className="mt-1 text-right text-xs tabular-nums text-stone-500">
                {maxInstallments}× de {formatPrice(installmentValueEqualParts(subtotal + effectiveShipping, maxInstallments))} s/ juros
              </p>
            </div>
          )}
        </div>
      )}

      {/* Pay button — only on step 3, in summary panel */}
      {step === 3 && (
        <div className="px-5 pb-5 pt-4">
          <button
            type="button"
            onClick={onPay}
            disabled={!canPay || pending}
            className={`w-full rounded-xl py-4 text-sm font-bold transition-all ${canPay && !pending ? "bg-stone-900 text-white shadow-md hover:bg-stone-800 cursor-pointer active:scale-[0.98]" : "cursor-not-allowed bg-stone-100 text-stone-400"}`}
          >
            {pending ? (
              <span className="flex items-center justify-center gap-2">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-300 border-t-stone-700" />
                Processando…
              </span>
            ) : canPay ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
                Efetuar pagamento
              </span>
            ) : "Selecione a forma de pagamento"}
          </button>
          {!canPay && <p className="mt-2 text-center text-[11px] text-stone-400">Preencha os dados e selecione Pix ou Cartão</p>}

          {/* Trust / security bar */}
          <div className="mt-4 flex items-center justify-center gap-3 text-[10px] text-stone-400">
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>
              Compra segura
            </span>
            <span className="text-stone-200">·</span>
            <span className="flex items-center gap-1">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
              Dados criptografados
            </span>
            <span className="text-stone-200">·</span>
            <span>InfinitePay</span>
          </div>
        </div>
      )}

      {/* Steps 1 & 2: placeholder note */}
      {step < 3 && (
        <div className="border-t border-stone-200 bg-stone-50 px-5 py-3">
          <p className="text-[11px] text-stone-400">Forma de pagamento selecionada no último passo</p>
        </div>
      )}
    </div>
  );
}

// ─── Step: Contato ────────────────────────────────────────────────────────────

function ContactStep({
  loggedIn, initialEmail, data, onChange, onNext,
  registerSubmit,
}: {
  loggedIn: boolean; initialEmail: string;
  data: ContactData; onChange: (d: ContactData) => void; onNext: () => void;
  registerSubmit: (fn: () => Promise<void>) => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const handleNext = useCallback(async () => {
    if (!data.name.trim()) { setError("Informe seu nome."); return; }
    if (!data.email.trim()) { setError("Informe seu e-mail."); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) { setError("E-mail inválido."); return; }
    if (data.phone.replace(/\D/g, "").length < 10) { setError("Informe um telefone válido com DDD."); return; }
    if (data.cpf.replace(/\D/g, "").length !== 11) { setError("Informe um CPF válido (11 dígitos)."); return; }
    setError(null);
    if (loggedIn) {
      setSaving(true);
      try {
        const res = await updateUserCheckoutContactAction({
          name: data.name.trim(),
          phone: data.phone,
          cpf: data.cpf,
        });
        if (!res.ok) { setError(res.error); return; }
      } finally {
        setSaving(false);
      }
    }
    onNext();
  }, [loggedIn, data, onNext]);

  // Register submit fn for mobile bottom bar
  useEffect(() => { registerSubmit(handleNext); }, [registerSubmit, handleNext]);

  return (
    <div className="space-y-5">
      {!loggedIn && (
        <>
          <GoogleSignInButton
            nextPath="/checkout"
            className="flex w-full items-center justify-center gap-2 rounded-lg border border-stone-200 bg-white py-2.5 text-sm font-medium text-stone-700 shadow-sm transition hover:bg-stone-50"
          />
          <div className="relative">
            <div className="absolute inset-0 flex items-center" aria-hidden>
              <div className="w-full border-t border-stone-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="bg-white px-3 text-xs font-medium uppercase tracking-wider text-stone-400">ou</span>
            </div>
          </div>
        </>
      )}
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500" htmlFor="c-name">Nome completo</label>
        <input id="c-name" type="text" autoComplete="name" placeholder="Seu nome completo"
          value={data.name} onChange={(e) => onChange({ ...data, name: e.target.value })} className={inputCls} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500" htmlFor="c-email">E-mail</label>
        {loggedIn ? (
          <div className="flex items-center gap-2.5 rounded-lg border border-stone-200 bg-stone-50 px-4 py-3">
            <svg className="h-4 w-4 shrink-0 text-stone-400" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
            <span className="text-sm text-stone-600">{data.email || initialEmail}</span>
          </div>
        ) : (
          <input id="c-email" type="email" autoComplete="email" placeholder="seu@email.com"
            value={data.email} onChange={(e) => onChange({ ...data, email: e.target.value })} className={inputCls} />
        )}
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500" htmlFor="c-phone">Telefone</label>
        <input id="c-phone" type="tel" autoComplete="tel" placeholder="(00) 00000-0000"
          value={data.phone} onChange={(e) => onChange({ ...data, phone: phoneFmt(e.target.value) })} className={inputCls} />
      </div>
      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500" htmlFor="c-cpf">CPF</label>
        <input id="c-cpf" type="text" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00"
          value={data.cpf} onChange={(e) => onChange({ ...data, cpf: cpfFmt(e.target.value) })} className={inputCls} />
      </div>
      {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}

      {/* Desktop-only button */}
      <button type="button" onClick={handleNext} disabled={saving}
        className="hidden lg:flex w-full items-center justify-center gap-1.5 rounded-xl bg-stone-900 py-3.5 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800 disabled:opacity-60">
        {saving ? "Salvando…" : "Continuar para entrega →"}
      </button>
    </div>
  );
}

// ─── Step: Entrega ────────────────────────────────────────────────────────────

function DeliveryStep({
  lines, data, onChange, onNext, onBack, registerSubmit, subtotal,
}: {
  lines: { productId: string; quantity: number }[];
  data: ShippingData; onChange: (d: ShippingData) => void;
  onNext: () => void; onBack: () => void;
  registerSubmit: (fn: () => Promise<void>) => void;
  subtotal: number;
}) {
  const { settings } = useStoreSettings();
  const [cepDigits, setCepDigits] = useState(data.cep);
  const [loadingCep, setLoadingCep] = useState(false);
  const [cepError, setCepError] = useState<string | null>(null);
  const [options, setOptions] = useState<NormalizedShippingOption[] | null>(null);
  const [loadingShipping, setLoadingShipping] = useState(false);
  const [shippingError, setShippingError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(data.optionId || null);
  const [formError, setFormError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const debRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { cheapestIds, fastestIds } = useMemo(() => rankHighlights(options ?? []), [options]);

  // Quando frete grátis, ordena opções do mais barato para o mais caro
  const freeShippingResult = settings ? checkFreeShipping(settings, subtotal) : null;
  const isFreeShipping = freeShippingResult?.isFree ?? false;
  const displayOptions = useMemo(() => {
    if (!options) return null;
    if (isFreeShipping) return [...options].sort((a, b) => a.price - b.price);
    return options;
  }, [options, isFreeShipping]);

  const lookupCep = useCallback(async (digits: string) => {
    setLoadingCep(true); setCepError(null);
    try {
      const r = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      const d = await r.json() as Record<string, string>;
      if (d.erro) { setCepError("CEP não encontrado."); return; }
      onChange({ ...data, cep: digits, street: d.logradouro || data.street, neighborhood: d.bairro || data.neighborhood, city: d.localidade || data.city, state: d.uf || data.state });
    } catch { setCepError("Não foi possível consultar o CEP."); }
    finally { setLoadingCep(false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, onChange]);

  const quoteShipping = useCallback(async (digits: string) => {
    abortRef.current?.abort();
    const ac = new AbortController(); abortRef.current = ac;
    setLoadingShipping(true); setShippingError(null); setOptions(null);
    try {
      const r = await fetch("/api/shipping", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ destinationCep: digits, lines }), signal: ac.signal });
      const j = await r.json() as { options?: NormalizedShippingOption[]; error?: string };
      if (!r.ok || !j.options?.length) { setShippingError(j.error ?? "Nenhuma opção disponível."); return; }
      setOptions(j.options);
    } catch (e) { if (e instanceof DOMException && e.name === "AbortError") return; setShippingError("Erro ao calcular frete."); }
    finally { setLoadingShipping(false); }
  }, [lines]);

  useEffect(() => {
    if (debRef.current) clearTimeout(debRef.current);
    if (cepDigits.length !== 8) { setOptions(null); setShippingError(null); return; }
    debRef.current = setTimeout(() => {
      void lookupCep(cepDigits); void quoteShipping(cepDigits);
      try { sessionStorage.setItem("shipping_cep", cepDigits); } catch {}
    }, 600);
    return () => { if (debRef.current) clearTimeout(debRef.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cepDigits]);

  useEffect(() => {
    if (!options?.length) return;
    // Quando frete grátis, pré-seleciona o mais barato (primeiro após ordenação)
    const first = isFreeShipping
      ? [...options].sort((a, b) => a.price - b.price)[0]
      : (options.find((o) => cheapestIds.has(o.id)) ?? options[0]);
    if (!selectedId || !options.some((o) => o.id === selectedId)) setSelectedId(first?.id ?? null);
  }, [options, cheapestIds, selectedId, isFreeShipping]);

  useEffect(() => {
    if (!selectedId || !options?.length) return;
    const o = options.find((x) => x.id === selectedId); if (!o) return;
    const cheapestId = isFreeShipping
      ? [...options].sort((a, b) => a.price - b.price)[0]?.id
      : null;
    const optionIsFree = isFreeShipping && o.id === cheapestId;
    onChange({
      ...data,
      optionId: o.id,
      optionLabel: `${o.carrierName} — ${o.serviceName}`,
      optionPrice: o.price,
      deliveryLabel: daysLabel(o),
      optionIsFree,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, options, isFreeShipping]);

  const handleNext = useCallback(async () => {
    if (cepDigits.length !== 8) { setFormError("Informe um CEP válido."); return; }
    if (!data.street.trim()) { setFormError("Informe a rua/logradouro."); return; }
    if (!data.number.trim()) { setFormError("Informe o número."); return; }
    if (!data.city.trim() || !data.state.trim()) { setFormError("Informe cidade e estado."); return; }
    if (!selectedId) { setFormError("Selecione uma opção de frete."); return; }
    setFormError(null); onNext();
  }, [cepDigits.length, data, selectedId, onNext]);

  useEffect(() => { registerSubmit(handleNext); }, [registerSubmit, handleNext]);

  return (
    <div className="space-y-5">
      {/* Mensagem de frete grátis */}
      {settings && (() => {
        const fs = checkFreeShipping(settings, subtotal);
        if (!settings.freeShippingEnabled) return null;
        if (fs.isFree) {
          return (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
              <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-medium text-emerald-700">Frete grátis aplicado ao seu pedido!</p>
            </div>
          );
        }
        // if (fs.missingAmount != null && fs.minValue != null) {
        //   const progress = Math.min(100, (subtotal / fs.minValue) * 100);
        //   return (
        //     <div className="space-y-2 rounded-lg bg-stone-50 border border-stone-200 px-4 py-3">
        //       <p className="text-sm text-stone-600">
        //         Falta <span className="font-semibold text-stone-900">{formatPrice(fs.missingAmount)}</span> para <span className="font-semibold text-stone-900">frete grátis</span>
        //       </p>
        //       <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
        //         <div className="h-full rounded-full bg-stone-900 transition-all duration-500" style={{ width: `${progress}%` }} />
        //       </div>
        //     </div>
        //   );
        // }
        return null;
      })()}

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500">CEP</label>
        <div className="relative">
          <input type="text" inputMode="numeric" autoComplete="postal-code" placeholder="00000-000"
            value={cepMask(cepDigits)} onChange={(e) => { const d = onlyDigits(e.target.value); setCepDigits(d); onChange({ ...data, cep: d }); if (d.length < 8) { setOptions(null); setShippingError(null); } }}
            className={inputCls} />
          {loadingCep && <span className="absolute right-3.5 top-1/2 -translate-y-1/2"><span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" /></span>}
        </div>
        {cepDigits.length > 0 && cepDigits.length < 8 && <p className="mt-1.5 text-xs text-stone-400">CEP incompleto.</p>}
        {cepError && <p className="mt-1.5 text-xs text-red-500">{cepError}</p>}
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500">Rua / Logradouro</label>
        <input type="text" autoComplete="street-address" placeholder="Rua das Flores"
          value={data.street} onChange={(e) => onChange({ ...data, street: e.target.value })} className={inputCls} />
      </div>

      <div className="grid grid-cols-[minmax(4.5rem,20%)_1fr] gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500">Número</label>
          <input type="text" placeholder="123"
            value={data.number} onChange={(e) => onChange({ ...data, number: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500">
            Complemento <span className="font-normal normal-case tracking-normal text-stone-400">(opcional)</span>
          </label>
          <input type="text" placeholder="Apto 4"
            value={data.complement} onChange={(e) => onChange({ ...data, complement: e.target.value })} className={inputCls} />
        </div>
      </div>

      <div>
        <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500">Bairro</label>
        <input type="text" placeholder="Centro"
          value={data.neighborhood} onChange={(e) => onChange({ ...data, neighborhood: e.target.value })} className={inputCls} />
      </div>

      <div className="grid grid-cols-[1fr_5rem] gap-4">
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500">Cidade</label>
          <input type="text" autoComplete="address-level2" placeholder="São Paulo"
            value={data.city} onChange={(e) => onChange({ ...data, city: e.target.value })} className={inputCls} />
        </div>
        <div>
          <label className="mb-1.5 block text-xs font-semibold uppercase tracking-wider text-stone-500">UF</label>
          <input type="text" autoComplete="address-level1" placeholder="SP" maxLength={2}
            value={data.state} onChange={(e) => onChange({ ...data, state: e.target.value.toUpperCase() })} className={inputCls} />
        </div>
      </div>

      {cepDigits.length === 8 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-stone-500">Opções de frete</p>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
            {loadingShipping && (
              <div className="flex items-center gap-3 px-4 py-4 text-sm text-stone-500">
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" />
                Calculando frete…
              </div>
            )}
            {shippingError && !loadingShipping && <p className="px-4 py-4 text-sm text-red-500">{shippingError}</p>}
            {!loadingShipping && displayOptions?.length ? (
              <ul className="divide-y divide-stone-100">
                {displayOptions.map((o, idx) => {
                  const isFree = isFreeShipping && idx === 0;
                  const id = `ship-${idx}-${o.id}`; const sel = selectedId === o.id;
                  return (
                    <li key={id}>
                      <label htmlFor={id} className={`flex cursor-pointer items-center gap-3 px-4 py-3.5 transition-colors ${sel ? "bg-stone-50" : "hover:bg-stone-50/50"}`}>
                        <input id={id} type="radio" name="ship-opt" checked={sel} onChange={() => setSelectedId(o.id)} className="mt-0.5 shrink-0 accent-stone-900" />
                        {/* Esquerda: nome + prazo */}
                        <div className="min-w-0 flex-1">
                          <p className={`text-sm font-medium leading-snug ${sel ? "text-stone-900" : "text-stone-700"}`}>
                            {o.carrierName}
                            {o.serviceName ? ` — ${o.serviceName}` : ""}
                          </p>
                          <div className="mt-1 flex items-center gap-1 text-xs text-stone-400">
                            <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                            </svg>
                            <span>{daysLabel(o)}</span>
                          </div>
                        </div>
                        {/* Direita: preço */}
                        <div className="shrink-0 text-right">
                          {isFree ? (
                            <>
                              <p className="text-base font-bold text-emerald-600">Grátis</p>
                              {o.price > 0 && (
                                <p className="text-xs tabular-nums text-stone-400 line-through">{formatPrice(o.price)}</p>
                              )}
                            </>
                          ) : (
                            <p className={`text-base font-bold tabular-nums ${o.price === 0 ? "text-emerald-600" : "text-stone-900"}`}>
                              {o.price === 0 ? "Grátis" : formatPrice(o.price)}
                            </p>
                          )}
                        </div>
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>
        </div>
      )}

      {formError && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{formError}</p>}

      {/* Desktop-only buttons */}
      <div className="hidden lg:flex gap-3 pt-1">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-5 py-3 text-sm font-medium text-stone-600 transition hover:bg-stone-50">
          Voltar
        </button>
        <button type="button" onClick={handleNext}
          className="flex flex-1 items-center justify-center rounded-xl bg-stone-900 py-3 text-sm font-semibold text-white shadow-sm transition hover:bg-stone-800">
          Confirmar endereço →
        </button>
      </div>
    </div>
  );
}

// ─── Step: Confirmar ──────────────────────────────────────────────────────────

function ConfirmStep({
  loggedIn, contact, shipping, lines, subtotal, subtotalPix,
  paymentMethod, onPaymentMethodChange,
  onPay, onBack, error, pending,
}: {
  loggedIn: boolean; contact: ContactData; shipping: ShippingData; lines: CartLine[];
  subtotal: number; subtotalPix: number;
  paymentMethod: PaymentMethod; onPaymentMethodChange: (m: PaymentMethod) => void;
  onPay: () => void; onBack: () => void; error: string | null; pending: boolean;
}) {
  // Max installments across all items (fallback 6)
  const maxInstallments = lines.reduce((acc, l) => {
    const n = l.installmentCount ?? 0;
    return n > acc ? n : acc;
  }, 0) || 6;

  // Preço real do frete (para exibição informativa)
  const displayShippingPrice = shipping.optionPrice;
  const { settings } = useStoreSettings();
  const qualifiesForFreeShipping = settings
    ? checkFreeShipping(settings, subtotal).isFree
    : false;
  const showShippingAsFree = Boolean(shipping.optionIsFree);
  // Frete não é cobrado no pagamento
  const effectiveShipping = 0;
  const pixTotal = subtotalPix + effectiveShipping;
  const cardTotal = subtotal + effectiveShipping;
  const cardInstallmentValue = installmentValueEqualParts(cardTotal, maxInstallments);

  const ReviewCard = ({ title, onEdit, children }: { title: string; onEdit: () => void; children: React.ReactNode }) => (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">{title}</p>
        <button type="button" onClick={onEdit} className="text-xs font-medium text-stone-500 underline-offset-2 hover:text-stone-900 hover:underline transition-colors">Editar</button>
      </div>
      <div className="px-4 py-3 text-sm text-stone-700 space-y-0.5">{children}</div>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Contact review */}
      <ReviewCard title="Contato" onEdit={onBack}>
        {contact.name && <p className="font-medium">{contact.name}</p>}
        <p>{contact.email}</p>
        {contact.phone && <p className="text-stone-500">{contact.phone}</p>}
        {contact.cpf && <p className="text-stone-500">CPF: {contact.cpf}</p>}
      </ReviewCard>

      {/* Delivery review */}
      <ReviewCard title="Endereço de entrega" onEdit={onBack}>
        <p>{shipping.street}{shipping.number ? `, ${shipping.number}` : ""}{shipping.complement ? ` — ${shipping.complement}` : ""}</p>
        {shipping.neighborhood && <p className="text-xs text-stone-500">{shipping.neighborhood}</p>}
        <p className="text-xs text-stone-500">{shipping.city}{shipping.state ? ` — ${shipping.state}` : ""} · CEP {cepMask(shipping.cep)}</p>
        {shipping.optionLabel && (
          <div className="mt-2 flex items-center justify-between border-t border-stone-100 pt-2">
            <div>
              <p className="text-xs font-medium text-stone-800">{shipping.optionLabel}</p>
              <p className="text-[11px] text-stone-400">{shipping.deliveryLabel}</p>
            </div>
            <ShippingPriceSummary
              price={displayShippingPrice}
              qualifiesForFreeShipping={showShippingAsFree}
              size="base"
            />
          </div>
        )}
      </ReviewCard>

      {/* Mensagem de frete grátis */}
      {settings && (() => {
        const fs = checkFreeShipping(settings, subtotal);
        if (!settings.freeShippingEnabled) return null;
        if (fs.isFree) {
          return (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3">
              <svg className="h-4 w-4 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
              <p className="text-sm font-medium text-emerald-700">Frete grátis aplicado neste pedido!</p>
            </div>
          );
        }
        // if (fs.missingAmount != null) {
        //   return (
        //     <div className="flex items-center gap-2 rounded-lg bg-stone-50 border border-stone-200 px-4 py-3">
        //       <svg className="h-4 w-4 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
        //         <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
        //       </svg>
        //       <p className="text-sm text-stone-600">
        //         Falta <span className="font-semibold text-stone-900">{formatPrice(fs.missingAmount)}</span> para <span className="font-semibold text-stone-900">frete grátis</span>
        //       </p>
        //     </div>
        //   );
        // }
        return null;
      })()}

      {/* Payment method selector */}
      <div className={`overflow-hidden rounded-xl border-2 bg-white shadow-sm transition-colors ${paymentMethod === null ? "border-amber-400" : "border-stone-200"}`}>
        <div className="flex items-center justify-between border-b border-stone-100 px-4 py-3">
          <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">Forma de pagamento</p>
          {paymentMethod === null && (
            <span className="flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-600">
              <svg className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              Obrigatório
            </span>
          )}
        </div>

        {paymentMethod === null && (
          <p className="px-4 pb-0 pt-3 text-sm font-medium text-stone-600">
            Escolha como deseja pagar:
          </p>
        )}

        <div className="grid grid-cols-2 gap-3 p-4">
          {/* Pix */}
          <button
            type="button"
            onClick={() => onPaymentMethodChange("pix")}
            className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all ${
              paymentMethod === "pix"
                ? "border-stone-900 bg-stone-50 shadow-sm"
                : paymentMethod === null
                  ? "border-dashed border-stone-300 hover:border-stone-400 hover:bg-stone-50/50"
                  : "border-stone-200 opacity-60 hover:opacity-100 hover:border-stone-300"
            }`}
          >
            <div className="flex w-full items-center gap-2">
              <Image src="/pix-icon.svg" alt="Pix" width={18} height={18} unoptimized className="h-[18px] w-[18px] shrink-0 object-contain" />
              <span className="text-sm font-semibold text-stone-900">Pix</span>
              <span className={`ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all ${paymentMethod === "pix" ? "border-stone-900 bg-stone-900" : "border-stone-300 bg-white"}`}>
                {paymentMethod === "pix" && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
            </div>
            <div>
              <p className="text-base font-bold tabular-nums text-stone-900">{formatPrice(pixTotal)}</p>
              <p className="text-[11px] text-stone-400">à vista</p>
              {showShippingAsFree && (
                <p className="text-[11px] text-emerald-600 font-medium">Frete grátis</p>
              )}
            </div>
          </button>

          {/* Cartão */}
          <button
            type="button"
            onClick={() => onPaymentMethodChange("card")}
            className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all ${
              paymentMethod === "card"
                ? "border-stone-900 bg-stone-50 shadow-sm"
                : paymentMethod === null
                  ? "border-dashed border-stone-300 hover:border-stone-400 hover:bg-stone-50/50"
                  : "border-stone-200 opacity-60 hover:opacity-100 hover:border-stone-300"
            }`}
          >
            <div className="flex w-full items-center gap-2">
              <svg className="h-[18px] w-[18px] shrink-0 text-stone-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
              </svg>
              <span className="text-sm font-semibold text-stone-900">Cartão</span>
              <span className={`ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all ${paymentMethod === "card" ? "border-stone-900 bg-stone-900" : "border-stone-300 bg-white"}`}>
                {paymentMethod === "card" && <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" /></svg>}
              </span>
            </div>
            <div>
              <p className="text-base font-bold tabular-nums text-stone-900">{formatPrice(cardTotal)}</p>
              <p className="text-[11px] text-stone-400">{maxInstallments}× {formatPrice(cardInstallmentValue)} s/ juros</p>
              {showShippingAsFree && (
                <p className="text-[11px] text-emerald-600 font-medium">Frete grátis</p>
              )}
            </div>
          </button>
        </div>
      </div>

      {/* Order summary — mobile only; mirrors desktop Resumo do pedido */}
      <div className="overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm lg:hidden">
        <p className="border-b border-stone-100 px-4 py-3 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Resumo do pedido</p>
        <ul className="divide-y divide-stone-100 px-4">
          {lines.map((l) => {
            const lineCard = l.price * l.quantity;
            const linePix = l.pixPrice != null && l.pixPrice > 0 ? l.pixPrice * l.quantity : null;
            const inst = (() => {
              const parts = Math.floor(l.installmentCount ?? 0);
              if (parts < 1) return null;
              return { parts, each: installmentValueEqualParts(l.price * l.quantity, parts) };
            })();
            return (
              <li key={l.lineId} className="flex gap-3 py-3 first:pt-3 last:pb-3">
                <div className="relative h-14 w-12 shrink-0 overflow-hidden rounded-md bg-stone-100">
                  {l.image
                    ? <Image src={l.image} alt="" fill className="object-cover" sizes="48px" />
                    : <div className="flex h-full items-center justify-center text-[9px] text-stone-400">—</div>}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-medium text-stone-900">{l.name}</p>
                  {l.pieceSelections?.map((r, i) => {
                    const d = describeCartPieceSelection(r);
                    return d ? <p key={i} className="mt-0.5 text-xs text-stone-500">{d}</p> : null;
                  })}
                  <p className="mt-1 text-xs text-stone-400 tabular-nums">{l.quantity} × {formatPrice(l.price)}</p>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-2 text-right">
                  {linePix != null && (
                    <div className="flex items-start gap-1.5">
                      <Image src="/pix-icon.svg" alt="" width={14} height={14} unoptimized className="mt-0.5 h-3.5 w-3.5 shrink-0 object-contain" />
                      <div>
                        <p className="text-[12px] tabular-nums text-stone-500">{formatPrice(linePix)}</p>
                        <p className="text-[10px] text-stone-400">à vista</p>
                      </div>
                    </div>
                  )}
                  <div className="flex items-start gap-1.5">
                    <svg className="mt-0.5 h-3.5 w-3.5 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                    </svg>
                    <div>
                      <p className="text-[12px] tabular-nums text-stone-500">{formatPrice(lineCard)}</p>
                      {inst && <p className="text-[10px] tabular-nums text-stone-400">{inst.parts}× {formatPrice(inst.each)}</p>}
                    </div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-t border-stone-100 px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Frete</p>
          {shipping.optionLabel ? (
            <div className="flex items-start justify-between gap-2">
              <p className="text-sm text-stone-600">{shipping.optionLabel}</p>
              <ShippingPriceSummary
                price={displayShippingPrice}
                qualifiesForFreeShipping={showShippingAsFree}
              />
            </div>
          ) : (
            <p className="text-sm text-stone-400">Calculado na etapa de entrega</p>
          )}
        </div>

        <div className="border-t border-stone-100 bg-stone-50 px-4 py-3">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Total a pagar</p>
          {paymentMethod === null && (
            <div className="flex items-center gap-2 rounded-lg border border-dashed border-amber-300 bg-amber-50 px-3 py-3">
              <svg className="h-4 w-4 shrink-0 text-amber-500" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" /></svg>
              <p className="text-sm text-amber-700">Selecione a forma de pagamento</p>
            </div>
          )}
          {paymentMethod === "pix" && (
            <div className="rounded-lg bg-stone-100 px-4 py-3 ring-1 ring-stone-200">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Image src="/pix-icon.svg" alt="Pix" width={16} height={16} unoptimized className="h-4 w-4 shrink-0 object-contain" />
                  <span className="text-sm font-medium text-stone-700">Pix · à vista</span>
                </div>
                <span className="text-lg font-bold tabular-nums text-stone-900">{formatPrice(pixTotal)}</span>
              </div>
            </div>
          )}
          {paymentMethod === "card" && (
            <div className="rounded-lg bg-stone-100 px-4 py-3 ring-1 ring-stone-200">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <svg className="h-4 w-4 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
                  </svg>
                  <span className="text-sm font-medium text-stone-700">Cartão de crédito</span>
                </div>
                <span className="text-lg font-bold tabular-nums text-stone-900">{formatPrice(cardTotal)}</span>
              </div>
              <p className="mt-1 text-right text-xs tabular-nums text-stone-500">
                {maxInstallments}× de {formatPrice(cardInstallmentValue)} s/ juros
              </p>
            </div>
          )}
        </div>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{error}</p>}

      {/* Desktop: only Voltar — pay button lives in the right summary panel */}
      <div className="hidden lg:flex gap-3 pt-1">
        <button type="button" onClick={onBack}
          className="flex items-center gap-1.5 rounded-xl border border-stone-200 px-5 py-3.5 text-sm font-medium text-stone-600 transition hover:bg-stone-50">
          Voltar
        </button>
      </div>

      {/* Mobile: pay button in fixed bottom bar (handled by mobileTriggerRef), but we still expose onPay for mobile */}
    </div>
  );
}

// ─── PIX Payment Screen ───────────────────────────────────────────────────────

function PixPaymentScreen({ data, onBack }: { data: PixData; onBack: () => void }) {
  const [copied, setCopied] = useState(false);
  const [pollingStatus, setPollingStatus] = useState<"waiting" | "paid" | "expired">("waiting");
  const [secondsLeft, setSecondsLeft] = useState(() => {
    const diff = Math.floor((new Date(data.expiresAt).getTime() - Date.now()) / 1000);
    return Math.max(0, diff);
  });

  useEffect(() => {
    if (secondsLeft <= 0) { setPollingStatus((s) => s === "waiting" ? "expired" : s); return; }
    const t = setInterval(() => {
      setSecondsLeft((s) => {
        const next = s - 1;
        if (next <= 0) setPollingStatus((cur) => cur === "waiting" ? "expired" : cur);
        return Math.max(0, next);
      });
    }, 1000);
    return () => clearInterval(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pollingStatus !== "waiting") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/checkout/pix-status/${data.orderId}`);
        if (!res.ok) return;
        const json = (await res.json()) as { status: string };
        if (json.status === "paid") {
          setPollingStatus("paid");
          window.location.assign(`/pedido/${data.orderId}`);
        }
      } catch {}
    }, 3000);
    return () => clearInterval(interval);
  }, [data.orderId, pollingStatus]);

  function formatTime(s: number) {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }
    return `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(data.pixCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {}
  }

  if (pollingStatus === "paid") {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-white">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <svg className="h-10 w-10 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </div>
        <div className="text-center">
          <p className="text-xl font-semibold text-stone-900">Pagamento confirmado!</p>
          <p className="mt-1 text-sm text-stone-500">Preparando seu pedido…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] overflow-y-auto bg-stone-50">
      <div className="mx-auto flex min-h-screen max-w-sm flex-col items-center justify-start gap-5 px-6 py-10">

        {/* Logo da loja */}
        <div className="flex flex-col items-center leading-none">
          <span className="text-base font-semibold uppercase tracking-[0.22em] text-stone-900">
            Ludimila Reis
          </span>
          <span className="text-[10px] font-light uppercase tracking-[0.4em] text-stone-400">
            Closet
          </span>
        </div>

        {/* Cabeçalho do Pix */}
        <div className="w-full rounded-2xl border border-stone-200 bg-white px-5 py-4 text-center shadow-sm">
          <div className="mb-1 flex items-center justify-center gap-2">
            <Image src="/pix-icon.svg" alt="Pix" width={20} height={20} unoptimized />
            <span className="text-sm font-semibold uppercase tracking-wider text-stone-700">Pague com PIX</span>
          </div>
          <p className="text-2xl font-bold text-stone-900">{formatPrice(data.amount)}</p>
          <p className="mt-1 text-xs text-stone-400">Escaneie o QR Code ou use o código copia e cola</p>
        </div>

        {/* QR Code */}
        {data.pixQrBase64 ? (
          <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`data:image/png;base64,${data.pixQrBase64}`} alt="QR Code PIX" className="h-52 w-52 object-contain" />
          </div>
        ) : (
          <div className="flex h-52 w-52 items-center justify-center rounded-2xl border border-stone-200 bg-white shadow-sm">
            <p className="text-xs text-stone-400">QR Code indisponível</p>
          </div>
        )}

        {/* Status / Countdown */}
        {pollingStatus === "expired" ? (
          <div className="w-full rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-center">
            <p className="text-sm font-semibold text-red-700">PIX expirado</p>
            <p className="mt-0.5 text-xs text-red-600">O tempo de pagamento esgotou. Tente novamente.</p>
          </div>
        ) : (
          <div className="flex w-full items-center justify-between rounded-xl border border-stone-200 bg-white px-4 py-3 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />
              <p className="text-sm text-stone-600">Aguardando pagamento</p>
            </div>
            <span className={`font-mono text-sm font-semibold tabular-nums ${secondsLeft < 120 ? "text-red-600" : "text-stone-900"}`}>
              {formatTime(secondsLeft)}
            </span>
          </div>
        )}

        {/* Copia e cola */}
        <div className="w-full rounded-xl border border-stone-200 bg-white p-4 shadow-sm">
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-stone-400">Copia e cola</p>
          <div className="flex gap-2">
            <code className="flex-1 truncate rounded-lg border border-stone-100 bg-stone-50 px-3 py-2.5 text-[11px] text-stone-600">
              {data.pixCode}
            </code>
            <button type="button" onClick={handleCopy}
              className={`shrink-0 rounded-lg px-4 py-2.5 text-xs font-semibold transition-colors ${copied ? "bg-emerald-600 text-white" : "bg-stone-900 text-white hover:bg-stone-700"}`}>
              {copied ? "✓ Copiado" : "Copiar"}
            </button>
          </div>
        </div>

        {/* Instruções */}
        <ol className="w-full space-y-2">
          {[
            "Abra o app do seu banco ou carteira digital.",
            "Escolha pagar com QR Code ou use o código copia e cola.",
            "O pagamento é confirmado automaticamente em segundos.",
          ].map((step, i) => (
            <li key={i} className="flex items-start gap-3 text-xs text-stone-500">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-stone-200 text-[10px] font-bold text-stone-600">
                {i + 1}
              </span>
              {step}
            </li>
          ))}
        </ol>

        {/* Ações */}
        {pollingStatus === "expired" && (
          <button type="button" onClick={onBack}
            className="w-full rounded-xl bg-stone-900 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-stone-700">
            Tentar novamente
          </button>
        )}

        {/* Rodapé */}
        <p className="flex items-center gap-1.5 text-xs text-stone-400">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
          </svg>
          Ambiente seguro · Mercado Pago
        </p>

      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function CheckoutClient({ initialEmail, initialName, initialPhone, initialCpf, loggedIn }: Props) {
  const { items, hydrated, clear, subtotalPix } = useCart();
  const [step, setStep] = useState(1);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(null);
  const [animKey, setAnimKey] = useState(0);
  const [dir, setDir] = useState<"fwd" | "bwd">("fwd");
  const [contactDone, setContactDone] = useState(false);
  const [deliveryDone, setDeliveryDone] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [redirecting, setRedirecting] = useState(false);
  const [pixData, setPixData] = useState<PixData | null>(null);
  const [pending, startTransition] = useTransition();

  // Ref for mobile bottom bar to trigger current step's submit
  const mobileTriggerRef = useRef<() => Promise<void>>(() => Promise.resolve());
  const registerSubmit = useCallback((fn: () => Promise<void>) => {
    mobileTriggerRef.current = fn;
  }, []);

  const sanitizedPhone =
    !initialPhone || initialPhone === "-" || initialPhone.replace(/\D/g, "").length < 10 ? "" : initialPhone;
  const sanitizedCpf =
    initialCpf.replace(/\D/g, "").length === 11 ? cpfFmt(initialCpf) : "";

  const [contact, setContact] = useState<ContactData>({
    name: initialName,
    email: initialEmail,
    phone: sanitizedPhone ? phoneFmt(sanitizedPhone) : "",
    cpf: sanitizedCpf,
  });
  const [shipping, setShipping] = useState<ShippingData>({
    cep: "", street: "", number: "", complement: "", neighborhood: "", city: "", state: "",
    optionId: "", optionLabel: "", optionPrice: 0, deliveryLabel: "",
  });

  useEffect(() => {
    if (loggedIn || typeof window === "undefined") return;
    try {
      const s = window.sessionStorage.getItem(GUEST_CHECKOUT_EMAIL_KEY);
      if (s?.trim()) { setContact((p) => ({ ...p, email: s.trim() })); window.sessionStorage.removeItem(GUEST_CHECKOUT_EMAIL_KEY); }
    } catch {}
  }, [loggedIn]);

  useEffect(() => {
    try { const c = sessionStorage.getItem("shipping_cep") ?? ""; if (c.length === 8) setShipping((p) => ({ ...p, cep: c })); } catch {}
  }, []);

  const lines = useMemo(() => items.map((i) => ({ lineId: i.lineId, productId: i.productId, quantity: i.quantity, name: i.name, price: i.price, pixPrice: i.pixPrice, installmentCount: i.installmentCount, image: i.image, pieceSelections: i.pieceSelections })), [items]);
  const shippingLines = useMemo(() => lines.map((l) => ({ productId: l.productId, quantity: l.quantity })), [lines]);
  const subtotal = useMemo(() => lines.reduce((a, l) => a + l.price * l.quantity, 0), [lines]);

  function navigate(to: number, direction: "fwd" | "bwd") {
    setDir(direction); setStep(to); setAnimKey((k) => k + 1);
  }

  const handlePay = useCallback(() => {
    if (!paymentMethod) { setSubmitError("Selecione a forma de pagamento."); return; }
    setSubmitError(null);
    startTransition(async () => {
      const res = await placeOrderAction({
        email: loggedIn ? undefined : contact.email.trim(),
        lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, ...(l.pieceSelections?.length ? { pieceSelections: l.pieceSelections } : {}) })),
        shipping: { destinationCep: shipping.cep, optionId: shipping.optionId },
        contact: { name: contact.name.trim() || undefined, phone: contact.phone.replace(/\D/g, "") || undefined },
        cpf: contact.cpf.replace(/\D/g, "") || undefined,
        address: { street: shipping.street.trim() || undefined, number: shipping.number.trim() || undefined, complement: shipping.complement.trim() || undefined, neighborhood: shipping.neighborhood.trim() || undefined, city: shipping.city.trim() || undefined, state: shipping.state.trim() || undefined },
        paymentMethod,
      });
      if (!res.ok) { setSubmitError(res.error); return; }
      clear();
      if (res.type === "pix") {
        setPixData({ orderId: res.orderId, pixCode: res.pixCode, pixQrBase64: res.pixQrBase64, expiresAt: res.expiresAt, amount: res.amount });
      } else {
        setRedirecting(true); window.location.assign(res.checkoutUrl);
      }
    });
  }, [paymentMethod, loggedIn, contact, shipping, lines, clear]);

  // Mobile back navigation
  function mobileBack() {
    if (step === 2) { setContactDone(false); navigate(1, "bwd"); }
    else if (step === 3) { setDeliveryDone(false); navigate(2, "bwd"); }
  }

  // PIX payment screen
  if (pixData) {
    return <PixPaymentScreen data={pixData} onBack={() => setPixData(null)} />;
  }

  // Redirecting overlay
  if (pending || redirecting) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col items-center justify-center gap-6 bg-white">
        <div className="relative flex items-center justify-center">
          <span className="absolute h-16 w-16 animate-ping rounded-full bg-stone-100 opacity-75" />
          <span className="relative flex h-12 w-12 items-center justify-center rounded-full bg-stone-900">
            <svg className="h-6 w-6 text-white" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
            </svg>
          </span>
        </div>
        <div className="text-center">
          <p className="text-base font-semibold text-stone-900">Finalizando seu pedido…</p>
          <p className="mt-1 text-sm text-stone-500">Você será redirecionado para o pagamento seguro.</p>
        </div>
        <p className="flex items-center gap-1.5 text-xs text-stone-400">
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" /></svg>
          Ambiente seguro · Não feche esta página
        </p>
      </div>
    );
  }

  if (!hydrated) return <div className="mx-auto max-w-lg px-6 py-16 text-sm text-stone-500">Carregando…</div>;

  if (lines.length === 0) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <h1 className="text-xl font-semibold text-stone-900">Checkout</h1>
        <p className="mt-3 text-sm text-stone-600">Seu carrinho está vazio.</p>
        <Link href="/" className="mt-8 inline-block rounded-full bg-stone-900 px-6 py-3 text-sm font-medium text-white hover:bg-stone-800 transition-colors">Ver produtos</Link>
      </div>
    );
  }

  const mobileActionLabel = step === 1 ? "Continuar para entrega →" : step === 2 ? "Confirmar endereço →" : "Efetuar pagamento →";
  const mobileCanPay = step !== 3 || paymentMethod !== null;

  return (
    <>
      <style>{`
        @keyframes ckFwd { from { opacity:0; transform:translateX(24px); } to { opacity:1; transform:translateX(0); } }
        @keyframes ckBwd { from { opacity:0; transform:translateX(-24px); } to { opacity:1; transform:translateX(0); } }
        .ck-fwd { animation: ckFwd 300ms cubic-bezier(.4,0,.2,1) both; }
        .ck-bwd { animation: ckBwd 300ms cubic-bezier(.4,0,.2,1) both; }
      `}</style>

      {/* ══════════════════════════════ MOBILE ══════════════════════════════ */}
      <div className="flex flex-col lg:hidden">
        {/* Product summary at top (collapsible) */}
        <MobileOrderSummary lines={lines} subtotal={subtotal} subtotalPix={subtotalPix} />

        {/* Sticky step bar — sticks just below the site header (h-14 = 56px) */}
        <div className="sticky top-14 z-40 border-b border-stone-200 bg-white/95 px-5 py-3 backdrop-blur-sm">
          <StepBar current={step} />
        </div>

        {/* Scrollable form content */}
        <div className="px-5 pb-32 pt-7">
          {/* Step heading */}
          <div className="mb-6">
            <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
              {["Seus dados de contato", "Para onde enviamos", "Revise e finalize"][step - 1]}
            </p>
            {/* <h2 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">
              {["Contato", "Endereço de entrega", "Confirmar pedido"][step - 1]}
            </h2> */}
          </div>

          {/* Animated step */}
          <div key={animKey} className={dir === "fwd" ? "ck-fwd" : "ck-bwd"}>
            {step === 1 && (
              <ContactStep loggedIn={loggedIn} initialEmail={initialEmail}
                data={contact} onChange={setContact} registerSubmit={registerSubmit}
                onNext={() => { setContactDone(true); navigate(2, "fwd"); }} />
            )}
            {step === 2 && (
              <DeliveryStep lines={shippingLines} data={shipping} onChange={setShipping}
                subtotal={subtotal}
                registerSubmit={registerSubmit}
                onNext={() => { setDeliveryDone(true); navigate(3, "fwd"); }}
                onBack={() => { setContactDone(false); navigate(1, "bwd"); }} />
            )}
            {step === 3 && (
              <ConfirmStep loggedIn={loggedIn} contact={contact} shipping={shipping}
                lines={lines} subtotal={subtotal} subtotalPix={subtotalPix}
                paymentMethod={paymentMethod} onPaymentMethodChange={setPaymentMethod}
                onPay={handlePay} onBack={() => { setDeliveryDone(false); navigate(2, "bwd"); }}
                error={submitError} pending={pending} />
            )}
          </div>
        </div>

        {/* Fixed bottom action bar */}
        <div className="fixed bottom-0 inset-x-0 z-50 border-t border-stone-200 bg-white/95 backdrop-blur-sm">
          <div className="flex items-center gap-3 px-5 py-4">
            {step > 1 && (
              <button type="button" onClick={mobileBack}
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-stone-200 text-stone-600 transition hover:bg-stone-50">
                ←
              </button>
            )}
            <button
              type="button"
              onClick={step === 3 ? handlePay : () => void mobileTriggerRef.current()}
              disabled={pending || !mobileCanPay}
              className={`flex flex-1 items-center justify-center rounded-xl py-3.5 text-sm font-bold shadow-sm transition disabled:opacity-60 ${mobileCanPay && !pending ? "bg-stone-900 text-white hover:bg-stone-800" : "cursor-not-allowed bg-stone-100 text-stone-400"}`}
            >
              {pending
                ? <span className="flex items-center gap-2"><span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-400 border-t-white" />Processando…</span>
                : mobileActionLabel}
            </button>
          </div>
        </div>
      </div>

      {/* ══════════════════════════════ DESKTOP ══════════════════════════════ */}
      <div className="hidden lg:block min-h-screen bg-stone-50">
        <div className="mx-auto max-w-5xl px-8 py-10">
          {/* Header row */}
          <div className="mb-8 flex items-center justify-between">
            <Link href="/" className="text-xs font-medium text-stone-400 transition hover:text-stone-700">← Voltar à loja</Link>
            <h1 className="text-lg font-semibold text-stone-900">Checkout</h1>
            <div className="w-24" />
          </div>

          <div className="grid grid-cols-[1fr_380px] gap-10 items-start">
            {/* Left: form — white card */}
            <div className="rounded-2xl bg-white p-8 shadow-sm">
              {/* Step bar */}
              <div className="mb-8 max-w-xs">
                <StepBar current={step} />
              </div>

              {/* Step heading */}
              <div className="mb-7">
                <p className="text-[11px] font-semibold uppercase tracking-widest text-stone-400">
                  {["Seus dados de contato", "Para onde enviamos", "Você está quase lá!"][step - 1]}
                </p>
                <h2 className="mt-1 text-2xl font-bold tracking-tight text-stone-900">
                  {["Contato", "Endereço de entrega", "Confirmar pedido"][step - 1]}
                </h2>
              </div>

              {/* Animated step */}
              <div key={animKey} className={dir === "fwd" ? "ck-fwd" : "ck-bwd"}>
                {step === 1 && (
                  <ContactStep loggedIn={loggedIn} initialEmail={initialEmail}
                    data={contact} onChange={setContact} registerSubmit={registerSubmit}
                    onNext={() => { setContactDone(true); navigate(2, "fwd"); }} />
                )}
                {step === 2 && (
                  <DeliveryStep lines={shippingLines} data={shipping} onChange={setShipping}
                    subtotal={subtotal}
                    registerSubmit={registerSubmit}
                    onNext={() => { setDeliveryDone(true); navigate(3, "fwd"); }}
                    onBack={() => { setContactDone(false); navigate(1, "bwd"); }} />
                )}
                {step === 3 && (
                  <ConfirmStep loggedIn={loggedIn} contact={contact} shipping={shipping}
                    lines={lines} subtotal={subtotal} subtotalPix={subtotalPix}
                    paymentMethod={paymentMethod} onPaymentMethodChange={setPaymentMethod}
                    onPay={handlePay} onBack={() => { setDeliveryDone(false); navigate(2, "bwd"); }}
                    error={submitError} pending={pending} />
                )}
              </div>
            </div>

            {/* Right: summary (sticky) */}
            <div className="sticky top-24">
              <DesktopSummary
                lines={lines} shipping={shipping}
                deliveryDone={deliveryDone}
                subtotal={subtotal} subtotalPix={subtotalPix}
                step={step} paymentMethod={paymentMethod}
                onPay={handlePay} pending={pending}
              />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
