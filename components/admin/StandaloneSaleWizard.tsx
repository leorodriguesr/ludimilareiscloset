"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { PieceSelector } from "@/components/product/PieceSelector";
import { formatPrice } from "@/lib/format";
import { installmentValueEqualParts } from "@/lib/product-pricing";
import {
  buildCartPieceSelections,
  emptyPieceSelections,
  pieceSelectionsAreComplete,
  type PieceSelectionMap,
} from "@/lib/product-piece-selection";
import type { Product } from "@/lib/types";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import { parseDiscountInputValue } from "@/lib/admin-sale/parse-discount-value";
import { isCustomerContactAddressComplete } from "@/lib/admin-sale/customer-form-complete";
import {
  cepMask,
  cpfFmt,
  lookupAddressByCep,
  onlyDigits,
  phoneFmt,
} from "@/lib/admin-sale/customer-form-input";

type DiscountForm = { mode: "FIXED" | "PERCENT"; value: string };

function buildDiscountPayload(discount: DiscountForm | null | undefined) {
  const value = parseDiscountInputValue(discount?.value ?? "");
  if (!discount || value == null) return undefined;
  return { mode: discount.mode, value };
}

type WizardLine = {
  key: string;
  product: Product;
  quantity: number;
  selections: PieceSelectionMap;
  itemDiscount: DiscountForm | null;
};

type PricingPreview = {
  subtotalOriginal: number;
  itemsDiscountTotal: number;
  subtotalAfterItemDiscounts: number;
  orderDiscountAmount: number;
  shippingAmount: number;
  total: number;
};

type Props = {
  products: Product[];
  onClose: () => void;
  onCreated: () => void;
};

const STEPS = [
  { id: "products", label: "Produtos", hint: "Itens da venda" },
  { id: "delivery", label: "Entrega", hint: "Frete ou combinar" },
  { id: "customer", label: "Cliente", hint: "Dados e endereço" },
  { id: "payment", label: "Pagamento", hint: "Forma e totais" },
] as const;

type ArrangedMode = "store_delivery" | "pickup" | "uber";

/* ─── UI helpers ─────────────────────────────────────────────── */

function FieldLabel({
  children,
  optional,
}: {
  children: React.ReactNode;
  optional?: boolean;
}) {
  return (
    <label className="mb-1.5 block text-xs font-medium uppercase tracking-wide text-stone-500">
      {children}
      {optional ? (
        <span className="ml-1 font-normal normal-case text-stone-400">(opcional)</span>
      ) : null}
    </label>
  );
}

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200 ${props.className ?? ""}`}
    />
  );
}

function TextArea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200 ${props.className ?? ""}`}
    />
  );
}

function CheckboxOption({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
  description?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-stone-200 bg-white px-4 py-3 transition-colors hover:bg-stone-50">
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        className="mt-0.5 h-4 w-4 shrink-0 accent-stone-900"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-stone-900">{label}</span>
        {description && (
          <span className="mt-0.5 block text-xs text-stone-500">{description}</span>
        )}
      </span>
    </label>
  );
}

function ProductPrices({
  product,
  quantity,
}: {
  product: Product;
  quantity: number;
}) {
  const cardTotal = product.price * quantity;
  const pixTotal =
    product.pixPrice != null && product.pixPrice > 0
      ? product.pixPrice * quantity
      : null;
  const installments = Math.floor(product.installmentCount ?? 0);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1">
      <div className="flex items-center gap-1.5">
        <svg className="h-3.5 w-3.5 shrink-0 text-stone-500" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
        </svg>
        <span className="text-sm font-semibold tabular-nums text-stone-900">
          {formatPrice(cardTotal)}
        </span>
        {installments > 0 && (
          <span className="text-xs text-stone-400">
            {installments}× {formatPrice(installmentValueEqualParts(cardTotal, installments))}
          </span>
        )}
      </div>
      {pixTotal != null && (
        <div className="flex items-center gap-1.5">
          <Image src="/pix-icon.svg" alt="" width={14} height={14} unoptimized className="h-3.5 w-3.5 shrink-0 object-contain" />
          <span className="text-sm font-semibold tabular-nums text-stone-700">
            {formatPrice(pixTotal)}
          </span>
          <span className="text-xs text-stone-400">à vista</span>
        </div>
      )}
    </div>
  );
}

function ProductSearchSelect({
  products,
  onSelect,
}: {
  products: Product[];
  onSelect: (product: Product) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return products;
    return products.filter((p) => p.name.toLowerCase().includes(q));
  }, [products, query]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-lg border border-stone-200 bg-white px-3 py-2.5 text-left text-sm text-stone-500 transition-colors hover:border-stone-300 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
      >
        <span>Selecionar produto…</span>
        <svg className={`h-4 w-4 shrink-0 text-stone-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-20 mt-2 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-lg">
          <div className="border-b border-stone-100 p-3">
            <input
              autoFocus
              placeholder="Buscar produto…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
            />
          </div>
          <ul className="max-h-64 overflow-y-auto overscroll-contain p-1">
            {filtered.length === 0 ? (
              <li className="px-3 py-6 text-center text-sm text-stone-400">
                Nenhum produto encontrado.
              </li>
            ) : (
              filtered.map((p) => {
                const pix =
                  p.pixPrice != null && p.pixPrice > 0 ? p.pixPrice : null;
                const inst = Math.floor(p.installmentCount ?? 0);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => {
                        onSelect(p);
                        setOpen(false);
                        setQuery("");
                      }}
                      className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-stone-50"
                    >
                      <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-100">
                        {p.images[0]?.url && (
                          <Image src={p.images[0].url} alt="" fill className="object-cover" sizes="48px" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="line-clamp-2 text-sm font-medium leading-snug text-stone-900">
                          {p.name}
                        </p>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                          <span className="text-xs font-semibold tabular-nums text-stone-800">
                            {formatPrice(p.price)}
                            {inst > 0 && (
                              <span className="ml-1 font-normal text-stone-400">
                                · {inst}× {formatPrice(installmentValueEqualParts(p.price, inst))}
                              </span>
                            )}
                          </span>
                          {pix != null && (
                            <span className="inline-flex items-center gap-1 text-xs tabular-nums text-stone-600">
                              <Image src="/pix-icon.svg" alt="" width={12} height={12} unoptimized className="h-3 w-3 object-contain" />
                              {formatPrice(pix)}
                            </span>
                          )}
                        </div>
                      </div>
                    </button>
                  </li>
                );
              })
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function PaymentMethodSelector({
  paymentMethod,
  onChange,
  pixTotal,
  cardTotal,
  maxInstallments,
}: {
  paymentMethod: "pix" | "card";
  onChange: (m: "pix" | "card") => void;
  pixTotal: number;
  cardTotal: number;
  maxInstallments: number;
}) {
  const cardInstallmentValue = installmentValueEqualParts(cardTotal, maxInstallments);

  return (
    <div className="overflow-hidden rounded-xl border-2 border-stone-200 bg-white shadow-sm">
      <div className="border-b border-stone-100 px-4 py-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-stone-400">
          Forma de pagamento
        </p>
      </div>
      <div className="grid grid-cols-2 gap-3 p-4">
        <button
          type="button"
          onClick={() => onChange("pix")}
          className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all ${
            paymentMethod === "pix"
              ? "border-stone-900 bg-stone-50 shadow-sm"
              : "border-stone-200 opacity-60 hover:border-stone-300 hover:opacity-100"
          }`}
        >
          <div className="flex w-full items-center gap-2">
            <Image src="/pix-icon.svg" alt="Pix" width={18} height={18} unoptimized className="h-[18px] w-[18px] shrink-0 object-contain" />
            <span className="text-sm font-semibold text-stone-900">Pix</span>
            <span className={`ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all ${paymentMethod === "pix" ? "border-stone-900 bg-stone-900" : "border-stone-300 bg-white"}`}>
              {paymentMethod === "pix" && (
                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-stone-900">{formatPrice(pixTotal)}</p>
            <p className="text-[11px] text-stone-400">à vista</p>
          </div>
        </button>

        <button
          type="button"
          onClick={() => onChange("card")}
          className={`flex flex-col items-start gap-2 rounded-xl border-2 p-4 text-left transition-all ${
            paymentMethod === "card"
              ? "border-stone-900 bg-stone-50 shadow-sm"
              : "border-stone-200 opacity-60 hover:border-stone-300 hover:opacity-100"
          }`}
        >
          <div className="flex w-full items-center gap-2">
            <svg className="h-[18px] w-[18px] shrink-0 text-stone-600" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24" aria-hidden>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z" />
            </svg>
            <span className="text-sm font-semibold text-stone-900">Cartão</span>
            <span className={`ml-auto flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-all ${paymentMethod === "card" ? "border-stone-900 bg-stone-900" : "border-stone-300 bg-white"}`}>
              {paymentMethod === "card" && (
                <svg className="h-2.5 w-2.5 text-white" viewBox="0 0 12 12" fill="none">
                  <path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              )}
            </span>
          </div>
          <div>
            <p className="text-base font-bold tabular-nums text-stone-900">{formatPrice(cardTotal)}</p>
            <p className="text-[11px] text-stone-400">
              {maxInstallments}× {formatPrice(cardInstallmentValue)} s/ juros
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}

function CopyBlock({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-stone-200 bg-stone-50 p-4">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">{label}</p>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input
          readOnly
          value={value}
          className="min-w-0 flex-1 break-all rounded-lg border border-stone-200 bg-white px-3 py-2 text-xs leading-relaxed text-stone-700"
        />
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard.writeText(value);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="shrink-0 rounded-lg bg-stone-900 px-3 py-2 text-xs font-medium text-white hover:bg-stone-800"
        >
          {copied ? "Copiado" : "Copiar"}
        </button>
      </div>
    </div>
  );
}

function OrderSummary({ pricing }: { pricing: PricingPreview | null }) {
  if (!pricing) {
    return (
      <div className="rounded-xl border border-dashed border-stone-200 bg-stone-50/80 p-5 text-sm text-stone-400">
        Adicione produtos para ver o resumo.
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">Resumo</p>
      <dl className="mt-4 space-y-2 text-sm">
        <div className="flex justify-between text-stone-600">
          <dt>Produtos</dt>
          <dd className="tabular-nums">{formatPrice(pricing.subtotalOriginal)}</dd>
        </div>
        {pricing.itemsDiscountTotal > 0 && (
          <div className="flex justify-between text-red-600">
            <dt>Descontos por item</dt>
            <dd className="tabular-nums">-{formatPrice(pricing.itemsDiscountTotal)}</dd>
          </div>
        )}
        {pricing.orderDiscountAmount > 0 && (
          <div className="flex justify-between text-red-600">
            <dt>Desconto geral</dt>
            <dd className="tabular-nums">-{formatPrice(pricing.orderDiscountAmount)}</dd>
          </div>
        )}
        <div className="flex justify-between text-stone-600">
          <dt>Entrega / frete</dt>
          <dd className="tabular-nums">{formatPrice(pricing.shippingAmount)}</dd>
        </div>
        <div className="flex justify-between border-t border-stone-100 pt-3 text-base font-semibold text-stone-900">
          <dt>Total</dt>
          <dd className="tabular-nums">{formatPrice(pricing.total)}</dd>
        </div>
      </dl>
    </div>
  );
}

/* ─── Main wizard ────────────────────────────────────────────── */

export function StandaloneSaleWizard({ products, onClose, onCreated }: Props) {
  const [step, setStep] = useState(0);
  const [lines, setLines] = useState<WizardLine[]>([]);

  const [fulfillmentType, setFulfillmentType] = useState<"CARRIER" | "ARRANGED">("CARRIER");
  const [arrangedMode, setArrangedMode] = useState<ArrangedMode | null>(null);
  const [destinationCep, setDestinationCep] = useState("");
  const [shippingOptions, setShippingOptions] = useState<NormalizedShippingOption[]>([]);
  const [selectedShippingId, setSelectedShippingId] = useState("");
  const [arrangedAmount, setArrangedAmount] = useState("");
  const [deliveryNotes, setDeliveryNotes] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [customerData, setCustomerData] = useState<"now" | "later">("now");
  const [contact, setContact] = useState({ name: "", email: "", phone: "", cpf: "" });
  const [address, setAddress] = useState({
    destinationCep: "",
    street: "",
    number: "",
    complement: "",
    neighborhood: "",
    city: "",
    state: "",
  });
  const [cepLookupError, setCepLookupError] = useState<string | null>(null);
  const [paymentAlreadyPaid, setPaymentAlreadyPaid] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<"pix" | "card">("pix");
  const [orderDiscount, setOrderDiscount] = useState<DiscountForm | null>(null);
  const [pricing, setPricing] = useState<PricingPreview | null>(null);
  const [loadingQuote, setLoadingQuote] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{
    orderNumber: number;
    total: number;
    customerDataUrl?: string;
    payment?: { type: string; pixCode?: string; checkoutUrl?: string };
  } | null>(null);

  const maxInstallments = useMemo(
    () =>
      lines.reduce((max, l) => {
        const n = Math.floor(l.product.installmentCount ?? 0);
        return n > max ? n : max;
      }, 1),
    [lines]
  );

  const shippingAmount = useMemo(() => {
    if (fulfillmentType === "ARRANGED") {
      if (arrangedMode !== "store_delivery") return 0;
      const n = Number(arrangedAmount.replace(",", "."));
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }
    const opt = shippingOptions.find((o) => o.id === selectedShippingId);
    return opt?.price ?? 0;
  }, [fulfillmentType, arrangedMode, arrangedAmount, shippingOptions, selectedShippingId]);

  const paymentTotals = useMemo(() => {
    const cardSubtotal = lines.reduce((s, l) => s + l.product.price * l.quantity, 0);
    const pixSubtotal = lines.reduce((s, l) => {
      const px =
        l.product.pixPrice != null && l.product.pixPrice > 0
          ? l.product.pixPrice
          : l.product.price;
      return s + px * l.quantity;
    }, 0);
    return {
      card: cardSubtotal + shippingAmount,
      pix: pixSubtotal + shippingAmount,
    };
  }, [lines, shippingAmount]);

  const linesPayload = useCallback(
    () =>
      lines.map((l) => ({
        productId: l.product.id,
        quantity: l.quantity,
        pieceSelections: buildCartPieceSelections(l.product.pieces, l.selections),
        itemDiscount: buildDiscountPayload(l.itemDiscount),
      })),
    [lines]
  );

  const refreshPricing = useCallback(async () => {
    if (lines.length === 0) {
      setPricing(null);
      return;
    }
    try {
      const res = await fetch("/api/admin/sales/preview-pricing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: linesPayload(),
          paymentMethod,
          shippingAmount,
          orderDiscount: buildDiscountPayload(orderDiscount),
        }),
      });
      const data = await res.json();
      if (res.ok) setPricing(data);
    } catch {
      /* ignore */
    }
  }, [lines.length, linesPayload, paymentMethod, shippingAmount, orderDiscount]);

  useEffect(() => {
    void refreshPricing();
  }, [refreshPricing]);

  function addProduct(product: Product) {
    setLines((prev) => [
      ...prev,
      {
        key: `${product.id}-${Date.now()}`,
        product,
        quantity: 1,
        selections: emptyPieceSelections(product.pieces),
        itemDiscount: null,
      },
    ]);
    setError(null);
  }

  async function lookupAddressCep(digits: string) {
    if (digits.length !== 8) return;
    setCepLookupError(null);
    const result = await lookupAddressByCep(digits);
    if (!result.ok) {
      setCepLookupError(result.error);
      return;
    }
    setAddress((a) => ({
      ...a,
      destinationCep: digits,
      street: result.address.street || a.street,
      neighborhood: result.address.neighborhood || a.neighborhood,
      city: result.address.city || a.city,
      state: result.address.state || a.state,
    }));
  }

  useEffect(() => {
    const digits = onlyDigits(address.destinationCep, 8);
    if (digits.length !== 8) return;
    const t = setTimeout(() => void lookupAddressCep(digits), 400);
    return () => clearTimeout(t);
  }, [address.destinationCep]);

  function updateLine(idx: number, patch: Partial<WizardLine>) {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  }

  async function quoteShipping() {
    setLoadingQuote(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sales/quote-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationCep: onlyDigits(destinationCep, 8),
          lines: lines.map((l) => ({
            productId: l.product.id,
            quantity: l.quantity,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao cotar frete.");
      setShippingOptions(data.options ?? []);
      setSelectedShippingId(data.options?.[0]?.id ?? "");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao cotar frete.");
    } finally {
      setLoadingQuote(false);
    }
  }

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/sales", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          lines: linesPayload(),
          fulfillmentType,
          carrierShipping:
            fulfillmentType === "CARRIER"
              ? { destinationCep: onlyDigits(destinationCep, 8), optionId: selectedShippingId }
              : undefined,
          arrangedShippingAmount:
            fulfillmentType === "ARRANGED" && arrangedMode === "store_delivery"
              ? parseDiscountInputValue(arrangedAmount) ?? 0
              : undefined,
          arrangedMode:
            fulfillmentType === "ARRANGED" ? arrangedMode ?? undefined : undefined,
          deliveryNotes: deliveryNotes.trim() || undefined,
          internalNotes: internalNotes || undefined,
          customerData,
          contact: customerData === "now" ? contact : undefined,
          address:
            customerData === "now"
              ? {
                  ...address,
                  destinationCep:
                    fulfillmentType === "CARRIER"
                      ? onlyDigits(destinationCep, 8)
                      : onlyDigits(address.destinationCep, 8),
                }
              : undefined,
          paymentAlreadyPaid,
          paymentMethod,
          orderDiscount: buildDiscountPayload(orderDiscount),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Erro ao criar venda.");
      setResult(data);
      onCreated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao criar venda.");
    } finally {
      setSubmitting(false);
    }
  }

  const customerStepComplete = useMemo(() => {
    if (customerData === "later") return true;
    return isCustomerContactAddressComplete({
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      cpf: contact.cpf,
      destinationCep: address.destinationCep,
      street: address.street,
      number: address.number,
      complement: address.complement,
      neighborhood: address.neighborhood,
      city: address.city,
      state: address.state,
    });
  }, [address, contact, customerData]);

  const canGoNext =
    step === 0
      ? lines.length > 0 &&
        lines.every((l) => pieceSelectionsAreComplete(l.product.pieces, l.selections))
      : step === 1
        ? fulfillmentType === "ARRANGED"
          ? arrangedMode !== null &&
            (arrangedMode !== "store_delivery" || arrangedAmount.trim() !== "")
          : Boolean(selectedShippingId)
        : step === 2
          ? customerStepComplete
          : true;

  /* ─── Success screen ───────────────────────────────────────── */

  if (result) {
    return (
      <div className="fixed inset-0 z-50 flex bg-stone-900/50 backdrop-blur-sm">
        <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white md:m-auto md:h-auto md:max-h-[calc(100dvh-2rem)] md:max-w-lg md:rounded-2xl md:border md:border-stone-200 md:shadow-xl">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-8">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
              <svg className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <h3 className="text-center text-xl font-semibold text-stone-900">
              Venda #{result.orderNumber} criada
            </h3>
            <p className="mt-1 text-center text-sm text-stone-500">
              Total: {formatPrice(result.total)}
            </p>
            <div className="mt-6 space-y-3">
              {result.customerDataUrl && (
                <CopyBlock label="Link para o cliente preencher dados" value={result.customerDataUrl} />
              )}
              {result.payment?.type === "pix" && result.payment.pixCode && (
                <CopyBlock label="Código PIX" value={result.payment.pixCode} />
              )}
              {result.payment?.type === "card" && result.payment.checkoutUrl && (
                <CopyBlock label="Link de pagamento (cartão)" value={result.payment.checkoutUrl} />
              )}
            </div>
          </div>
          <div className="shrink-0 border-t border-stone-100 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] sm:px-8">
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-stone-900 py-3 text-sm font-medium text-white hover:bg-stone-800"
            >
              Fechar
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ─── Wizard shell ───────────────────────────────────────── */

  return (
    <div className="fixed inset-0 z-50 flex bg-stone-900/50 backdrop-blur-sm">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white md:m-auto md:h-auto md:max-h-[calc(100dvh-2rem)] md:max-w-6xl md:rounded-2xl md:border md:border-stone-200 md:shadow-2xl">
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-4 py-4 sm:px-6">
          <div className="min-w-0 pr-3">
            <h2 className="truncate text-base font-semibold text-stone-900 sm:text-lg">Nova venda avulsa</h2>
            <p className="mt-0.5 truncate text-xs text-stone-500 sm:text-sm">
              {STEPS[step].label} · {step + 1}/{STEPS.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            aria-label="Fechar"
          >
            <svg className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Stepper */}
        <div className="shrink-0 border-b border-stone-100 bg-stone-50/80 px-3 py-3 sm:px-6">
          <ol className="flex gap-2 overflow-x-auto pb-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden lg:gap-3">
            {STEPS.map((s, i) => {
              const active = i === step;
              const done = i < step;
              return (
                <li
                  key={s.id}
                  className={`flex min-w-[4.75rem] shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 sm:min-w-[5.5rem] lg:min-w-0 lg:flex-1 lg:px-3 ${
                    active ? "bg-white ring-1 ring-stone-200" : ""
                  }`}
                >
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold sm:h-7 sm:w-7 sm:text-xs ${
                      active
                        ? "bg-stone-900 text-white"
                        : done
                          ? "bg-stone-200 text-stone-700"
                          : "bg-white text-stone-400 ring-1 ring-stone-200"
                    }`}
                  >
                    {done ? "✓" : i + 1}
                  </span>
                  <span
                    className={`truncate text-[11px] font-medium sm:text-xs ${
                      active ? "text-stone-900" : "text-stone-500"
                    }`}
                  >
                    {s.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
          {/* Content */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-6">
            {error && (
              <div className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            {/* Step 0 — Produtos */}
            {step === 0 && (
              <div className="space-y-6">
                <section className="rounded-xl border border-stone-200 bg-stone-50/50 p-5">
                  <h3 className="text-sm font-semibold text-stone-900">Adicionar produto</h3>
                  <p className="mt-1 text-xs text-stone-500">
                    Selecione o produto e configure cor e tamanho nos itens da venda.
                  </p>

                  <div className="mt-4">
                    <FieldLabel>Produto</FieldLabel>
                    <ProductSearchSelect products={products} onSelect={addProduct} />
                  </div>

                  <div className="mt-5">
                    <FieldLabel>Observações internas</FieldLabel>
                    <TextArea
                      rows={2}
                      placeholder="Visível apenas para admin e gestor…"
                      value={internalNotes}
                      onChange={(e) => setInternalNotes(e.target.value)}
                    />
                  </div>
                </section>

                {lines.length > 0 && (
                  <section>
                    <h3 className="mb-3 text-sm font-semibold text-stone-900">
                      Itens da venda ({lines.length})
                    </h3>
                    <div className="max-h-[min(42vh,22rem)] space-y-3 overflow-y-auto overscroll-contain pr-0.5">
                      {lines.map((line, idx) => (
                        <div key={line.key} className="rounded-xl border border-stone-200 bg-white p-3 sm:p-4">
                          <div className="flex items-start gap-3 sm:gap-4">
                            <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-stone-100 sm:h-14 sm:w-14">
                              {line.product.images[0]?.url && (
                                <Image
                                  src={line.product.images[0].url}
                                  alt=""
                                  fill
                                  className="object-cover"
                                  sizes="56px"
                                />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="break-words text-sm font-medium leading-snug text-stone-900 sm:text-base">
                                    {line.product.name}
                                  </p>
                                  <ProductPrices product={line.product} quantity={line.quantity} />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== idx))}
                                  className="shrink-0 text-xs text-red-600 hover:text-red-800"
                                >
                                  Remover
                                </button>
                              </div>
                              <div className="mt-3 grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-end sm:gap-3">
                                <div className="col-span-1">
                                  <FieldLabel>Qtd</FieldLabel>
                                  <TextInput
                                    type="number"
                                    min={1}
                                    value={line.quantity}
                                    onChange={(e) =>
                                      updateLine(idx, {
                                        quantity: Math.max(1, Number(e.target.value) || 1),
                                      })
                                    }
                                  />
                                </div>
                                <div className="col-span-1">
                                  <FieldLabel>Desc. item</FieldLabel>
                                  <div className="flex gap-1">
                                    <select
                                      value={line.itemDiscount?.mode ?? "FIXED"}
                                      onChange={(e) =>
                                        updateLine(idx, {
                                          itemDiscount: {
                                            mode: e.target.value as "FIXED" | "PERCENT",
                                            value: line.itemDiscount?.value ?? "",
                                          },
                                        })
                                      }
                                      className="w-14 rounded-lg border border-stone-200 px-2 py-2.5 text-sm"
                                    >
                                      <option value="FIXED">R$</option>
                                      <option value="PERCENT">%</option>
                                    </select>
                                    <TextInput
                                      placeholder="0"
                                      value={line.itemDiscount?.value ?? ""}
                                      onChange={(e) =>
                                        updateLine(idx, {
                                          itemDiscount: {
                                            mode: line.itemDiscount?.mode ?? "FIXED",
                                            value: e.target.value,
                                          },
                                        })
                                      }
                                      className="min-w-0 flex-1"
                                    />
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>

                          {line.product.pieces.length > 0 && (
                            <div className="mt-4 border-t border-stone-100 pt-4">
                              <FieldLabel>Variantes</FieldLabel>
                              <PieceSelector
                                pieces={line.product.pieces}
                                selections={line.selections}
                                onSelectionsChange={(next) => updateLine(idx, { selections: next })}
                              />
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </section>
                )}
              </div>
            )}

            {/* Step 1 — Entrega */}
            {step === 1 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <CheckboxOption
                    checked={fulfillmentType === "CARRIER"}
                    onChange={() => {
                      setFulfillmentType("CARRIER");
                      setArrangedMode(null);
                    }}
                    label="Transportadora"
                    description="Cotação SuperFrete com valor real"
                  />
                  <CheckboxOption
                    checked={fulfillmentType === "ARRANGED"}
                    onChange={() => {
                      setFulfillmentType("ARRANGED");
                      setSelectedShippingId("");
                      setShippingOptions([]);
                    }}
                    label="Entrega a combinar"
                    description="Entregador da loja, retirada ou Uber"
                  />
                </div>

                {fulfillmentType === "CARRIER" ? (
                  <div className="space-y-4 rounded-xl border border-stone-200 p-5">
                    <div>
                      <FieldLabel>CEP de destino</FieldLabel>
                      <div className="flex gap-2">
                        <TextInput
                          placeholder="00000-000"
                          value={cepMask(onlyDigits(destinationCep, 8))}
                          onChange={(e) => setDestinationCep(onlyDigits(e.target.value, 8))}
                        />
                        <button
                          type="button"
                          onClick={() => void quoteShipping()}
                          disabled={loadingQuote || onlyDigits(destinationCep, 8).length !== 8}
                          className="shrink-0 rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-40"
                        >
                          {loadingQuote ? "Calculando…" : "Calcular"}
                        </button>
                      </div>
                    </div>
                    {shippingOptions.length > 0 && (
                      <div className="space-y-2">
                        <FieldLabel>Opção de frete</FieldLabel>
                        {shippingOptions.map((opt) => (
                          <label
                            key={opt.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors ${
                              selectedShippingId === opt.id
                                ? "border-stone-900 bg-stone-50"
                                : "border-stone-200 hover:border-stone-300"
                            }`}
                          >
                            <input
                              type="radio"
                              name="shipping"
                              checked={selectedShippingId === opt.id}
                              onChange={() => setSelectedShippingId(opt.id)}
                              className="accent-stone-900"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-sm font-medium text-stone-900">
                                {opt.carrierName} — {opt.serviceName}
                              </p>
                              {opt.deliveryDaysMax > 0 && (
                                <p className="text-xs text-stone-500">
                                  até {opt.deliveryDaysMax} dias úteis
                                </p>
                              )}
                            </div>
                            <span className="text-sm font-semibold tabular-nums text-stone-900">
                              {formatPrice(opt.price)}
                            </span>
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3 rounded-xl border border-stone-200 p-5">
                    <FieldLabel>Tipo de entrega</FieldLabel>
                    <div className="space-y-2">
                      <CheckboxOption
                        checked={arrangedMode === "store_delivery"}
                        onChange={() => setArrangedMode("store_delivery")}
                        label="Entregador da loja"
                      />
                      <CheckboxOption
                        checked={arrangedMode === "pickup"}
                        onChange={() => {
                          setArrangedMode("pickup");
                          setArrangedAmount("");
                        }}
                        label="Retirada"
                      />
                      <CheckboxOption
                        checked={arrangedMode === "uber"}
                        onChange={() => {
                          setArrangedMode("uber");
                          setArrangedAmount("");
                        }}
                        label="Uber"
                      />
                    </div>

                    {arrangedMode === "store_delivery" && (
                      <div className="pt-2">
                        <FieldLabel>Valor da entrega (R$)</FieldLabel>
                        <TextInput
                          placeholder="Ex.: 25,00"
                          value={arrangedAmount}
                          onChange={(e) => setArrangedAmount(e.target.value)}
                        />
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <FieldLabel>Observações da entrega</FieldLabel>
                  <TextArea
                    rows={2}
                    placeholder="Ex.: Entregar após 18h, retirar na portaria…"
                    value={deliveryNotes}
                    onChange={(e) => setDeliveryNotes(e.target.value)}
                  />
                </div>
              </div>
            )}

            {/* Step 2 — Cliente */}
            {step === 2 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <CheckboxOption
                    checked={customerData === "now"}
                    onChange={() => setCustomerData("now")}
                    label="Preencher agora"
                    description="Informar dados do cliente nesta etapa"
                  />
                  <CheckboxOption
                    checked={customerData === "later"}
                    onChange={() => setCustomerData("later")}
                    label="Adicionar depois"
                    description="Gerar link para o cliente preencher"
                  />
                </div>

                {customerData === "now" && (
                  <div className="space-y-5 rounded-xl border border-stone-200 p-5">
                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">
                        Contato
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <FieldLabel>Nome</FieldLabel>
                          <TextInput value={contact.name} onChange={(e) => setContact((c) => ({ ...c, name: e.target.value }))} />
                        </div>
                        <div>
                          <FieldLabel>E-mail</FieldLabel>
                          <TextInput type="email" value={contact.email} onChange={(e) => setContact((c) => ({ ...c, email: e.target.value }))} />
                        </div>
                        <div>
                          <FieldLabel>Telefone</FieldLabel>
                          <TextInput
                            inputMode="numeric"
                            placeholder="(00) 00000-0000"
                            value={phoneFmt(contact.phone)}
                            onChange={(e) => setContact((c) => ({ ...c, phone: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
                          />
                        </div>
                        <div>
                          <FieldLabel>CPF</FieldLabel>
                          <TextInput
                            inputMode="numeric"
                            placeholder="000.000.000-00"
                            value={cpfFmt(contact.cpf)}
                            onChange={(e) => setContact((c) => ({ ...c, cpf: e.target.value.replace(/\D/g, "").slice(0, 11) }))}
                          />
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-stone-400">
                        Endereço
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <FieldLabel>CEP</FieldLabel>
                          <TextInput
                            inputMode="numeric"
                            placeholder="00000-000"
                            value={cepMask(onlyDigits(address.destinationCep, 8))}
                            onChange={(e) => {
                              const digits = onlyDigits(e.target.value, 8);
                              setAddress((a) => ({ ...a, destinationCep: digits }));
                              if (digits.length < 8) setCepLookupError(null);
                            }}
                          />
                          {cepLookupError && (
                            <p className="mt-1 text-xs text-red-500">{cepLookupError}</p>
                          )}
                        </div>
                        <div className="sm:col-span-2">
                          <FieldLabel>Rua</FieldLabel>
                          <TextInput value={address.street} onChange={(e) => setAddress((a) => ({ ...a, street: e.target.value }))} />
                        </div>
                        <div>
                          <FieldLabel>Número</FieldLabel>
                          <TextInput value={address.number} onChange={(e) => setAddress((a) => ({ ...a, number: e.target.value }))} />
                        </div>
                        <div>
                          <FieldLabel optional>Complemento</FieldLabel>
                          <TextInput value={address.complement} onChange={(e) => setAddress((a) => ({ ...a, complement: e.target.value }))} />
                        </div>
                        <div>
                          <FieldLabel>Bairro</FieldLabel>
                          <TextInput value={address.neighborhood} onChange={(e) => setAddress((a) => ({ ...a, neighborhood: e.target.value }))} />
                        </div>
                        <div>
                          <FieldLabel>Cidade</FieldLabel>
                          <TextInput value={address.city} onChange={(e) => setAddress((a) => ({ ...a, city: e.target.value }))} />
                        </div>
                        <div>
                          <FieldLabel>Estado</FieldLabel>
                          <TextInput maxLength={2} value={address.state} onChange={(e) => setAddress((a) => ({ ...a, state: e.target.value.toUpperCase() }))} />
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Step 3 — Pagamento */}
            {step === 3 && (
              <div className="space-y-6">
                <div className="space-y-2">
                  <CheckboxOption
                    checked={paymentAlreadyPaid}
                    onChange={() => setPaymentAlreadyPaid(true)}
                    label="Já foi pago"
                    description="Registrar pagamento manual"
                  />
                  <CheckboxOption
                    checked={!paymentAlreadyPaid}
                    onChange={() => setPaymentAlreadyPaid(false)}
                    label="Aguardando pagamento"
                    description="Gerar link PIX ou cartão"
                  />
                </div>

                {!paymentAlreadyPaid && (
                  <PaymentMethodSelector
                    paymentMethod={paymentMethod}
                    onChange={setPaymentMethod}
                    pixTotal={paymentTotals.pix}
                    cardTotal={paymentTotals.card}
                    maxInstallments={maxInstallments}
                  />
                )}

                <div className="rounded-xl border border-stone-200 p-5">
                  <FieldLabel>Desconto na venda inteira</FieldLabel>
                  <div className="flex gap-2">
                    <select
                      value={orderDiscount?.mode ?? "FIXED"}
                      onChange={(e) =>
                        setOrderDiscount({
                          mode: e.target.value as "FIXED" | "PERCENT",
                          value: orderDiscount?.value ?? "",
                        })
                      }
                      className="rounded-lg border border-stone-200 px-3 py-2.5 text-sm"
                    >
                      <option value="FIXED">R$</option>
                      <option value="PERCENT">%</option>
                    </select>
                    <TextInput
                      inputMode="decimal"
                      placeholder="0"
                      value={orderDiscount?.value ?? ""}
                      onChange={(e) =>
                        setOrderDiscount({
                          mode: orderDiscount?.mode ?? "FIXED",
                          value: e.target.value,
                        })
                      }
                      className="max-w-[8rem]"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Summary — desktop sidebar */}
          <aside className="hidden shrink-0 border-t border-stone-100 bg-stone-50/50 px-6 py-5 lg:block lg:w-72 lg:border-l lg:border-t-0">
            <OrderSummary pricing={pricing} />
          </aside>
        </div>

        {/* Summary — mobile sticky bar */}
        <div className="shrink-0 border-t border-stone-100 bg-stone-50 px-4 py-3 lg:hidden">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-stone-400">Total da venda</p>
              <p className="truncate text-lg font-semibold tabular-nums text-stone-900">
                {pricing ? formatPrice(pricing.total) : "—"}
              </p>
            </div>
            {pricing && pricing.itemsDiscountTotal + pricing.orderDiscountAmount > 0 && (
              <p className="shrink-0 text-xs text-red-600">
                Desc. -{formatPrice(pricing.itemsDiscountTotal + pricing.orderDiscountAmount)}
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-t border-stone-100 bg-white px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6 sm:py-4">
          <button
            type="button"
            disabled={step === 0}
            onClick={() => setStep((s) => s - 1)}
            className="rounded-lg border border-stone-200 px-4 py-2.5 text-sm font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"
          >
            Voltar
          </button>
          {step < STEPS.length - 1 ? (
            <button
              type="button"
              disabled={!canGoNext}
              onClick={() => setStep((s) => s + 1)}
              className="rounded-lg bg-stone-900 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-stone-800 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !canGoNext}
              onClick={() => void handleSubmit()}
              className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-emerald-800 disabled:cursor-not-allowed disabled:opacity-40 sm:px-5"
            >
              {submitting ? "Criando…" : "Criar venda"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
