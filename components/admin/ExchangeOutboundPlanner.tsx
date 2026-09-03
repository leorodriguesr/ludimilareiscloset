"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import { formatPrice } from "@/lib/format";
import { installmentValueEqualParts } from "@/lib/product-pricing";
import {
  CustomSaleSetsForm,
  type CustomSaleSetInput,
} from "@/components/admin/CustomSaleSetsForm";
import { ProductSearchSelect } from "@/components/admin/ProductSearchSelect";
import { AdminModal } from "@/components/admin/AdminModal";
import { PieceSelector } from "@/components/product/PieceSelector";
import type { Product } from "@/lib/types";
import {
  EXCHANGE_SHIPPING_METHOD_LABELS,
  LOCAL_COURIER_CUSTOMER_FEE,
} from "@/lib/exchanges/shipping-method";
import { computeExchangeBalance } from "@/lib/exchanges/balance";
import { formatPieceLabel } from "@/lib/exchanges/return-units";
import { parsePieceSelections } from "@/lib/exchanges/serialize";
import { isSamePieceSwap, productIdentityKey, roundMoney } from "@/lib/exchanges/product-diff";
import type { NormalizedShippingOption } from "@/lib/shipping/types";

type ExchangeShippingMethod = "CARRIER" | "STORE_PICKUP" | "LOCAL_COURIER";
import { parseDiscountInputValue } from "@/lib/admin-sale/parse-discount-value";
import {
  buildCartPieceSelections,
  emptyPieceSelections,
  pieceSelectionsAreComplete,
  type PieceSelectionMap,
} from "@/lib/product-piece-selection";

type DiscountForm = { mode: "FIXED" | "PERCENT"; value: string };

type ChargePaymentMethod = "pix" | "card";

type ChargePaymentResult =
  | {
      type: "pix";
      pixCode: string;
      pixQrBase64: string | null;
      expiresAt: string;
      amount: number;
    }
  | { type: "card"; checkoutUrl: string; amount: number };

type OutboundLineRole = "REPLACEMENT" | "ADDITIONAL_SALE";

type OutboundCatalogDraft = {
  key: string;
  kind: "catalog";
  product: Product;
  quantity: number;
  selections: PieceSelectionMap;
  itemDiscount: DiscountForm | null;
  lineRole: OutboundLineRole;
};

type OutboundCustomDraft = {
  key: string;
  kind: "custom";
  productName: string;
  quantity: number;
  unitPrice: number;
  pieces: CustomSaleSetInput["pieces"];
  itemDiscount: DiscountForm | null;
  lineRole: OutboundLineRole;
};

type OutboundDraft = OutboundCatalogDraft | OutboundCustomDraft;

function discountFromForm(discount: DiscountForm | null): {
  mode: "FIXED" | "PERCENT";
  value: number;
} | undefined {
  const value = parseDiscountInputValue(discount?.value ?? "");
  if (!discount || value == null) return undefined;
  return { mode: discount.mode, value };
}

function lineBaseUnit(
  line: OutboundDraft,
  paymentMethod: ChargePaymentMethod | null
): number {
  if (line.kind === "custom") return line.unitPrice;
  if (paymentMethod === "card") return line.product.price;
  return line.product.pixPrice != null && line.product.pixPrice > 0
    ? line.product.pixPrice
    : line.product.price;
}

function discountAmount(
  base: number,
  discount?: { mode: "FIXED" | "PERCENT"; value: number }
): number {
  if (!discount || discount.value <= 0 || base <= 0) return 0;
  if (discount.mode === "FIXED") {
    return roundMoney(Math.min(discount.value, base));
  }
  const pct = Math.min(Math.max(discount.value, 0), 100);
  return roundMoney((base * pct) / 100);
}

function lineEffectiveUnit(
  line: OutboundDraft,
  paymentMethod: ChargePaymentMethod | null = null
): number {
  const base = lineBaseUnit(line, paymentMethod);
  const cut = discountAmount(base, discountFromForm(line.itemDiscount));
  return roundMoney(Math.max(base - cut, 0));
}

function CatalogPrices({
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
        <svg
          className="h-3.5 w-3.5 shrink-0 text-stone-500"
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
        <span className="text-sm font-semibold tabular-nums text-stone-900">
          {formatPrice(cardTotal)}
        </span>
        {installments > 0 ? (
          <span className="text-xs text-stone-400">
            {installments}×{" "}
            {formatPrice(installmentValueEqualParts(cardTotal, installments))}
          </span>
        ) : null}
      </div>
      {pixTotal != null ? (
        <div className="flex items-center gap-1.5">
          <Image
            src="/pix-icon.svg"
            alt=""
            width={14}
            height={14}
            unoptimized
            className="h-3.5 w-3.5 shrink-0 object-contain"
          />
          <span className="text-sm font-semibold tabular-nums text-stone-700">
            {formatPrice(pixTotal)}
          </span>
          <span className="text-xs text-stone-400">à vista</span>
        </div>
      ) : null}
    </div>
  );
}

function catalogLineReady(line: OutboundCatalogDraft): boolean {
  return pieceSelectionsAreComplete(line.product.pieces, line.selections);
}

export type ReturnedPiece = {
  id: string;
  productId?: string | null;
  orderItemId?: string | null;
  productName: string;
  productImageUrl?: string | null;
  pieceSelectionsJson?: string | null;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type OrderItemRef = {
  id: string;
  productName: string;
  productImageUrl?: string | null;
  pieceSelectionsJson?: string | null;
  quantity?: number;
};

function returnedPieceLabels(item: ReturnedPiece): string[] {
  const selections = parsePieceSelections(item.pieceSelectionsJson);
  if (selections.length > 0) return selections.map(formatPieceLabel);
  return item.productName.trim() ? [item.productName] : [];
}

function groupReturnedPieces(
  items: ReturnedPiece[],
  orderItems: OrderItemRef[]
): {
  key: string;
  name: string;
  imageUrl: string | null;
  pieces: string[];
  isSet: boolean;
}[] {
  const groups = new Map<string, ReturnedPiece[]>();
  for (const item of items) {
    const key = item.orderItemId ?? item.id;
    const list = groups.get(key) ?? [];
    list.push(item);
    groups.set(key, list);
  }

  return [...groups.entries()].map(([key, group]) => {
    const orderItem = orderItems.find((row) => row.id === group[0].orderItemId);
    const pieces = group.flatMap(returnedPieceLabels);
    const uniquePieces = [...new Set(pieces)];
    const orderPieceCount = parsePieceSelections(
      orderItem?.pieceSelectionsJson
    ).length;
    const isSet = uniquePieces.length > 1 || orderPieceCount > 1;
    return {
      key,
      name: orderItem?.productName ?? group[0].productName,
      imageUrl: orderItem?.productImageUrl ?? group[0].productImageUrl ?? null,
      pieces: uniquePieces,
      isSet,
    };
  });
}

const PLAN_STEPS = ["Peças", "Frete"] as const;

function StepBar({
  current,
  onSelect,
}: {
  current: 1 | 2;
  onSelect: (step: 1 | 2) => void;
}) {
  return (
    <ol className="mx-auto flex w-full max-w-sm items-center justify-center">
      {PLAN_STEPS.map((label, i) => {
        const index = (i + 1) as 1 | 2;
        const active = current === index;
        const done = current > index;
        return (
          <li key={label} className="flex min-w-0 items-center">
            {i > 0 ? (
              <span
                className={`mx-3 h-px w-12 sm:w-20 ${
                  done || active ? "bg-stone-400" : "bg-stone-200"
                }`}
                aria-hidden
              />
            ) : null}
            <button
              type="button"
              disabled={index === 2 && current === 1}
              onClick={() => onSelect(index)}
              className="flex items-center gap-2 disabled:cursor-default"
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${
                  active
                    ? "bg-stone-900 text-white ring-4 ring-stone-900/10"
                    : done
                      ? "bg-stone-800 text-white"
                      : "border border-stone-200 bg-white text-stone-400"
                }`}
              >
                {done ? (
                  <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24" aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="m4.5 12.75 6 6 9-13.5" />
                  </svg>
                ) : (
                  index
                )}
              </span>
              <span
                className={`text-xs font-medium ${
                  active ? "text-stone-900" : "text-stone-500"
                }`}
              >
                {label}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

function PieceCard({
  name,
  price,
  imageUrl,
  quantity,
  highlight,
  details,
  footer,
  flush,
}: {
  name: string;
  price?: string;
  imageUrl?: string | null;
  quantity?: number;
  highlight?: boolean;
  details?: string[];
  footer?: React.ReactNode;
  flush?: boolean;
}) {
  return (
    <div
      className={`flex gap-3 ${
        flush
          ? ""
          : highlight
            ? "rounded-xl border border-stone-200 bg-stone-50 px-3 py-3"
            : "rounded-xl border border-stone-200 bg-white px-3 py-3"
      }`}
    >
      {imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={imageUrl}
          alt=""
          className="h-14 w-14 shrink-0 rounded-lg object-cover"
        />
      ) : (
        <div
          className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-stone-100 text-[10px] font-medium text-stone-400"
        >
          Peça
        </div>
      )}
      <div className="min-w-0 flex-1">
        {highlight ? (
          <p className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide text-stone-400">
            A enviar
          </p>
        ) : null}
        <p className="truncate text-sm font-medium text-stone-900">
          {name}
        </p>
        {details && details.length > 0 ? (
          <ul className="mt-1 space-y-0.5 text-xs text-stone-500">
            {details.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        ) : null}
        {price || (quantity && quantity > 1) ? (
          <p className="mt-1 text-xs text-stone-500">
            {quantity && quantity > 1 ? `${quantity}× · ` : null}
            {price}
          </p>
        ) : null}
        {footer}
      </div>
    </div>
  );
}

type Props = {
  exchangeId: string;
  destinationCep: string | null;
  initialMethod: ExchangeShippingMethod;
  returnedItems: ReturnedPiece[];
  orderItems?: OrderItemRef[];
  returnedCredit: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function ExchangeOutboundPlanner({
  exchangeId,
  destinationCep,
  initialMethod,
  returnedItems,
  orderItems = [],
  returnedCredit,
  busy,
  error: externalError,
  onClose,
  onSaved,
}: Props) {
  const [products, setProducts] = useState<Product[]>([]);
  const [showCustom, setShowCustom] = useState(false);
  const [outbound, setOutbound] = useState<OutboundDraft[]>([]);
  const [method, setMethod] = useState<ExchangeShippingMethod>(initialMethod);
  const [paidBy, setPaidBy] = useState<"STORE" | "CUSTOMER">("CUSTOMER");
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [serviceName, setServiceName] = useState<string | null>(
    initialMethod === "CARRIER"
      ? null
      : EXCHANGE_SHIPPING_METHOD_LABELS[initialMethod]
  );

  const [quotedPrice, setQuotedPrice] = useState<number | null>(
    initialMethod === "CARRIER" ? null : 0
  );
  const [quoteOptions, setQuoteOptions] = useState<NormalizedShippingOption[]>(
    []
  );
  const [quoting, setQuoting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [adjustmentMode, setAdjustmentMode] = useState<"none" | "charge" | "refund">(
    "none"
  );
  const [adjustmentInput, setAdjustmentInput] = useState("");
  const [step, setStep] = useState<1 | 2>(1);
  const [paymentMethod, setPaymentMethod] =
    useState<ChargePaymentMethod | null>(null);
  const [chargePayment, setChargePayment] =
    useState<ChargePaymentResult | null>(null);
  const [outboundSaved, setOutboundSaved] = useState(false);
  const [chargeBusy, setChargeBusy] = useState(false);
  const [copiedPayment, setCopiedPayment] = useState<"pix" | "card" | null>(
    null
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/products");
        const data: unknown = await res.json();
        if (!cancelled && Array.isArray(data)) {
          setProducts(data as Product[]);
        }
      } catch {
        /* catálogo vazio até tentar de novo */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const adjustmentAmount = useMemo(() => {
    const n = Number(adjustmentInput.trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0 || adjustmentMode === "none") return 0;
    return roundMoney(adjustmentMode === "refund" ? -n : n);
  }, [adjustmentInput, adjustmentMode]);

  const preview = useMemo(() => {
    const newItemsTotal = roundMoney(
      outbound.reduce(
        (acc, line) =>
          acc + lineEffectiveUnit(line, paymentMethod) * line.quantity,
        0
      )
    );
    const replacement = outbound.filter(
      (line) => line.lineRole !== "ADDITIONAL_SALE"
    );
    const additionalItemsTotal = roundMoney(
      outbound
        .filter((line) => line.lineRole === "ADDITIONAL_SALE")
        .reduce(
          (acc, line) =>
            acc + lineEffectiveUnit(line, paymentMethod) * line.quantity,
          0
        )
    );
    const returnedByOrderItem = new Map<string, ReturnedPiece[]>();
    for (const item of returnedItems) {
      if (!item.orderItemId) continue;
      const rows = returnedByOrderItem.get(item.orderItemId) ?? [];
      rows.push(item);
      returnedByOrderItem.set(item.orderItemId, rows);
    }
    const allReturnItemsFullySelected =
      returnedByOrderItem.size > 0 &&
      [...returnedByOrderItem].every(([orderItemId, rows]) => {
        const orderItem = orderItems.find((item) => item.id === orderItemId);
        if (!orderItem) return false;
        const expectedUnits =
          Math.max(orderItem.quantity ?? 1, 1) *
          Math.max(
            parsePieceSelections(orderItem.pieceSelectionsJson).length,
            1
          );
        const selectedUnits = rows.reduce(
          (sum, row) =>
            sum +
            row.quantity *
              Math.max(parsePieceSelections(row.pieceSelectionsJson).length, 1),
          0
        );
        return selectedUnits === expectedUnits;
      });
    const returnedProductKeys = [...returnedByOrderItem].map(
      ([orderItemId, rows]) => {
        const orderItem = orderItems.find((item) => item.id === orderItemId);
        return {
          key: productIdentityKey(
            rows[0]?.productId ?? null,
            orderItem?.productName ?? rows[0]?.productName ?? ""
          ),
          quantity: orderItem?.quantity ?? 1,
        };
      }
    );
    const samePieceSwap =
      replacement.length > 0 &&
      isSamePieceSwap({
        returned: returnedProductKeys,
        outbound: replacement.map((line) => ({
          key: productIdentityKey(
            line.kind === "catalog" ? line.product.id : null,
            line.kind === "catalog" ? line.product.name : line.productName
          ),
          quantity: line.quantity,
        })),
        allReturnItemsFullySelected,
      });
    return computeExchangeBalance({
      returnedItemsTotal: returnedCredit,
      newItemsTotal,
      samePieceSwap,
      additionalItemsTotal,
      adjustmentAmount,
      shippings: [
        {
          quotedPrice:
            method === "STORE_PICKUP"
              ? 0
              : method === "LOCAL_COURIER"
                ? paidBy === "CUSTOMER"
                  ? LOCAL_COURIER_CUSTOMER_FEE
                  : 0
                : quotedPrice,
          paidBy: method === "STORE_PICKUP" ? "STORE" : paidBy,
        },
      ],
    });
  }, [
    adjustmentAmount,
    method,
    orderItems,
    outbound,
    paidBy,
    quotedPrice,
    paymentMethod,
    returnedCredit,
    returnedItems,
  ]);

  const returnedGroups = useMemo(
    () => groupReturnedPieces(returnedItems, orderItems),
    [orderItems, returnedItems]
  );

  const customerOwes = preview.balanceAmount > 0.009;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;

  useEffect(() => {
    if (!chargePayment) return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const res = await fetch(`/api/admin/exchanges/${exchangeId}`);
          const data = (await res.json()) as {
            exchange?: { balanceStatus?: string };
          };
          if (
            data.exchange?.balanceStatus &&
            data.exchange.balanceStatus !== "PENDING"
          ) {
            await onSavedRef.current();
          }
        } catch {
          /* tenta de novo no próximo intervalo */
        }
      })();
    }, 4000);
    return () => window.clearInterval(timer);
  }, [chargePayment, exchangeId]);

  function applyMethod(next: ExchangeShippingMethod) {
    setMethod(next);
    setQuoteOptions([]);
    setPaidBy("STORE");
    setError(null);
    if (next === "CARRIER") {
      setServiceId(null);
      setServiceName(null);
      setQuotedPrice(null);
      void quoteFreight();
      return;
    }
    setServiceId(null);
    setServiceName(EXCHANGE_SHIPPING_METHOD_LABELS[next]);
    setQuotedPrice(0);
  }

  function setShippingPaidBy(next: "STORE" | "CUSTOMER") {
    setPaidBy(next);
    if (method === "LOCAL_COURIER") {
      setQuotedPrice(next === "CUSTOMER" ? LOCAL_COURIER_CUSTOMER_FEE : 0);
    }
  }

  async function quoteFreight() {
    if (!destinationCep) {
      setError("Pedido sem CEP para cotar o envio.");
      return;
    }
    setQuoting(true);
    setError(null);
    try {
      const catalogLines = outbound
        .filter((l): l is OutboundCatalogDraft => l.kind === "catalog")
        .map((l) => ({ productId: l.product.id, quantity: l.quantity }));
      const res = await fetch("/api/admin/exchanges/quote-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationCep,
          lines:
            catalogLines.length > 0
              ? catalogLines
              : [{ productId: "", quantity: 1 }],
        }),
      });
      const data = (await res.json()) as {
        options?: NormalizedShippingOption[];
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? "Falha ao cotar frete.");
        return;
      }
      const options = data.options ?? [];
      setQuoteOptions(options);
      const cheapest = [...options].sort((a, b) => a.price - b.price)[0];
      if (cheapest) {
        setServiceId(cheapest.serviceId);
        setServiceName(`${cheapest.carrierName} — ${cheapest.serviceName}`);
        setQuotedPrice(cheapest.price);
      }
    } finally {
      setQuoting(false);
    }
  }

  async function generateChargePayment(methodToCharge: ChargePaymentMethod) {
    const payRes = await fetch(`/api/admin/exchanges/${exchangeId}/payment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ paymentMethod: methodToCharge }),
    });
    const payData = (await payRes.json()) as ChargePaymentResult & {
      error?: string;
    };
    if (!payRes.ok || payData.error) {
      setError(payData.error ?? "Não foi possível gerar o pagamento.");
      return;
    }
    if (payData.type === "pix") {
      setChargePayment({
        type: "pix",
        pixCode: payData.pixCode,
        pixQrBase64: payData.pixQrBase64,
        expiresAt: payData.expiresAt,
        amount: payData.amount,
      });
      return;
    }
    if (payData.type === "card") {
      setChargePayment({
        type: "card",
        checkoutUrl: payData.checkoutUrl,
        amount: payData.amount,
      });
    }
  }

  async function copyPaymentText(value: string, key: "pix" | "card") {
    try {
      await navigator.clipboard.writeText(value);
      setCopiedPayment(key);
      window.setTimeout(() => setCopiedPayment(null), 2000);
    } catch {
      window.alert("Não foi possível copiar. Tente novamente.");
    }
  }

  async function save() {
    if (outbound.length === 0) {
      setError("Selecione o produto que será enviado.");
      return;
    }
    if (outbound.some((l) => l.kind === "catalog" && !catalogLineReady(l))) {
      setError("Selecione cor e tamanho de cada peça.");
      return;
    }
    if (method === "CARRIER" && (quotedPrice == null || serviceId == null)) {
      setError("Selecione o frete.");
      return;
    }
    if (customerOwes && !paymentMethod) {
      setError("Selecione PIX ou cartão para cobrar a cliente.");
      return;
    }
    const shippingPaidBy = method === "STORE_PICKUP" ? "STORE" : paidBy;
    const shippingPrice =
      method === "STORE_PICKUP"
        ? 0
        : method === "LOCAL_COURIER"
          ? shippingPaidBy === "CUSTOMER"
            ? LOCAL_COURIER_CUSTOMER_FEE
            : 0
          : quotedPrice;
    setSaving(true);
    setError(null);
    try {
      if (!outboundSaved) {
        const res = await fetch(`/api/admin/exchanges/${exchangeId}/outbound`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            outboundLines: outbound.map((l) =>
              l.kind === "custom"
                ? {
                    kind: "custom",
                    description: l.productName,
                    quantity: l.quantity,
                    unitPrice: lineEffectiveUnit(l, paymentMethod),
                    lineRole: l.lineRole,
                    pieces: l.pieces,
                  }
                : {
                    kind: "catalog",
                    productId: l.product.id,
                    quantity: l.quantity,
                    unitPrice: lineEffectiveUnit(l, paymentMethod),
                    lineRole: l.lineRole,
                    pieceSelections: buildCartPieceSelections(
                      l.product.pieces,
                      l.selections
                    ),
                  }
            ),
            adjustmentAmount,
            adjustmentReason: null,
            shipping: {
              type: "OUTBOUND",
              method,
              shippingServiceId: serviceId,
              shippingServiceName: serviceName,
              quotedPrice: shippingPrice,
              paidBy: shippingPaidBy,
            },
          }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Não foi possível definir o envio.");
          return;
        }
        setOutboundSaved(true);
      }

      if (customerOwes && paymentMethod) {
        await generateChargePayment(paymentMethod);
        return;
      }

      await onSaved();
    } catch {
      setError("Erro de rede ao definir o envio.");
    } finally {
      setSaving(false);
    }
  }

  const shownError = error ?? externalError;

  function goToFreight() {
    if (outbound.length === 0) {
      setError("Selecione o produto que será enviado.");
      return;
    }
    if (
      outbound.some((l) => l.kind === "catalog" && !catalogLineReady(l))
    ) {
      setError("Selecione cor e tamanho de cada peça.");
      return;
    }
    setError(null);
    setStep(2);
    if (method === "CARRIER") {
      void quoteFreight();
    }
  }

  return (
    <AdminModal
      xl
      title="Definir novo envio"
      onClose={onClose}
      bannerInMain
      banner={
        <StepBar
          current={step}
          onSelect={(next) => {
            if (next === 2) {
              goToFreight();
              return;
            }
            setStep(1);
          }}
        />
      }
      aside={
        <section className="space-y-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
            Ajuste de saldo
          </h4>
          <div className="flex flex-wrap gap-1.5">
            {(
              [
                ["none", "Nenhum"],
                ["charge", "Cobrar"],
                ["refund", "Devolver"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setAdjustmentMode(key)}
                className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                  adjustmentMode === key
                    ? "border-sky-300 bg-sky-100 text-sky-900"
                    : "border-stone-200 bg-white text-stone-600"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {adjustmentMode !== "none" ? (
            <input
              value={adjustmentInput}
              onChange={(e) => setAdjustmentInput(e.target.value)}
              placeholder="Valor"
              className="w-full rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm"
            />
          ) : null}
          <dl className="space-y-1 text-xs text-stone-600">
            <div className="flex justify-between gap-3">
              <dt>Peças da troca</dt>
              <dd>
                {formatPrice(
                  Math.max(
                    0,
                    preview.newItemsTotal -
                      outbound
                        .filter((line) => line.lineRole === "ADDITIONAL_SALE")
                        .reduce(
                          (acc, line) =>
                            acc +
                            lineEffectiveUnit(line, paymentMethod) *
                              line.quantity,
                          0
                        )
                  )
                )}
              </dd>
            </div>
            {outbound.some((line) => line.lineRole === "ADDITIONAL_SALE") ? (
              <div className="flex justify-between gap-3">
                <dt>Nova venda</dt>
                <dd>
                  {formatPrice(
                    outbound
                      .filter((line) => line.lineRole === "ADDITIONAL_SALE")
                      .reduce(
                        (acc, line) =>
                          acc +
                          lineEffectiveUnit(line, paymentMethod) *
                            line.quantity,
                        0
                      )
                  )}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3">
              <dt>Crédito devolvido</dt>
              <dd>- {formatPrice(preview.returnedItemsTotal)}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt>Frete de envio</dt>
              <dd>{formatPrice(preview.shippingCustomerTotal)}</dd>
            </div>
            {Math.abs(adjustmentAmount) > 0.009 ? (
              <div className="flex justify-between gap-3">
                <dt>Ajuste</dt>
                <dd>
                  {adjustmentAmount > 0 ? "+" : "-"}{" "}
                  {formatPrice(Math.abs(adjustmentAmount))}
                </dd>
              </div>
            ) : null}
            <div className="flex justify-between gap-3 font-semibold text-stone-900">
              <dt>Saldo</dt>
              <dd className="text-right">
                {preview.balanceAmount > 0.009
                  ? `Cliente deve ${formatPrice(preview.balanceAmount)}`
                  : preview.balanceAmount < -0.009
                    ? `Restituir ${formatPrice(Math.abs(preview.balanceAmount))}`
                    : formatPrice(0)}
              </dd>
            </div>
          </dl>
          {customerOwes && step === 2 ? (
            <p className="text-[11px] text-stone-500">
              Envio fica aguardando pagamento. Depois de pago, cai em Envios.
            </p>
          ) : preview.balanceAmount <= 0.009 && step === 2 ? (
            <p className="text-[11px] text-stone-500">
              Sem débito da cliente. Este envio vai para Envios.
            </p>
          ) : null}
        </section>
      }
      footer={
        <>
          {shownError ? (
            <p className="mr-auto max-w-[14rem] truncate text-xs text-red-600 sm:max-w-none">
              {shownError}
            </p>
          ) : null}
          <button
            type="button"
            onClick={
              step === 1 || outboundSaved || chargePayment
                ? onClose
                : () => setStep(1)
            }
            className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
          >
            {step === 1 || outboundSaved || chargePayment
              ? "Cancelar"
              : "Voltar"}
          </button>
          {step === 1 ? (
            <button
              type="button"
              disabled={outbound.length === 0}
              onClick={goToFreight}
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              disabled={
                busy ||
                saving ||
                outbound.length === 0 ||
                (customerOwes && !paymentMethod)
              }
              onClick={
                chargePayment ? () => void onSaved() : () => void save()
              }
              className="rounded-lg bg-stone-900 px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
            >
              {chargePayment
                ? "Fechar"
                : saving
                  ? customerOwes
                    ? "Gerando pagamento…"
                    : "Salvando…"
                  : customerOwes
                    ? "Confirmar e cobrar"
                    : "Confirmar envio"}
            </button>
          )}
        </>
      }
    >
      {step === 1 ? (
      <>
      <section className="mb-5 overflow-hidden rounded-xl border border-orange-100">
        <div className="border-b border-orange-100 bg-orange-50/70 px-3 py-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-orange-700/70">
            Devolvidas
          </h4>
        </div>
        <ul className="divide-y divide-orange-100">
          {returnedGroups.map((group) => {
            const pieceDetails =
              group.isSet || group.pieces.some((piece) => piece !== group.name)
                ? group.pieces
                : [];
            return (
              <li key={group.key} className="px-3 py-3">
                <PieceCard
                  name={group.name}
                  imageUrl={group.imageUrl}
                  details={pieceDetails}
                  flush
                />
              </li>
            );
          })}
        </ul>
        <div className="border-t border-orange-100 px-3 py-2.5">
          <p className="text-xs text-orange-800/70">
            Crédito disponível ·{" "}
            <span className="font-medium text-orange-950">
              {formatPrice(returnedCredit)}
            </span>
          </p>
        </div>
      </section>

      <section className="rounded-xl border border-emerald-100">
        <div className="border-b border-emerald-100 bg-emerald-50/70 px-3 py-2.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-emerald-700/70">
            À Enviar 
          </h4>
        </div>
        <div className="space-y-3 px-3 py-3">
        <div className="relative z-30 flex flex-col gap-1.5 sm:flex-row sm:items-center">
          <ProductSearchSelect
            products={products}
            onSelect={(p) => {
              setOutbound((prev) => [
                ...prev,
                {
                  key: `${p.id}-${Date.now()}`,
                  kind: "catalog",
                  product: p,
                  quantity: 1,
                  selections: emptyPieceSelections(p.pieces),
                  itemDiscount: null,
                  lineRole: "REPLACEMENT",
                },
              ]);
              setShowCustom(false);
            }}
          />
          <button
            type="button"
            onClick={() => setShowCustom((v) => !v)}
            className={`inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
              showCustom
                ? "border-sky-300 bg-sky-100 text-sky-900"
                : "border-stone-200 bg-white text-stone-700 hover:border-stone-300 hover:bg-stone-50"
            }`}
          >
            <svg
              className="h-3.5 w-3.5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
              aria-hidden
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 4.5v15m7.5-7.5h-15"
              />
            </svg>
            Novo produto
          </button>
        </div>
        {showCustom && (
          <CustomSaleSetsForm
            compact
            title="Produto sem cadastro"
            descriptionLabel="O que será enviado?"
            submitLabel="Adicionar"
            onCancel={() => setShowCustom(false)}
            onAdd={(sets) => {
              setOutbound((prev) => [
                ...prev,
                ...sets.map((set) => ({
                  key: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
                  kind: "custom" as const,
                  productName: set.description,
                  quantity: 1,
                  unitPrice: set.unitPrice,
                  pieces: set.pieces,
                  itemDiscount: null,
                  lineRole: "REPLACEMENT" as const,
                })),
              ]);
              setShowCustom(false);
            }}
          />
        )}
        </div>
        {outbound.length > 0 ? (
          <ul className="divide-y divide-emerald-100 border-t border-emerald-100">
            {outbound.map((line) => (
              <li key={line.key} className="px-3 py-3 sm:px-4 sm:py-4">
                <div className="flex gap-3 sm:gap-4">
                  {line.kind === "catalog" ? (
                    <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-white sm:h-16 sm:w-16">
                      {line.product.images[0]?.url ? (
                        <Image
                          src={line.product.images[0].url}
                          alt=""
                          fill
                          className="object-cover"
                          sizes="64px"
                        />
                      ) : null}
                    </div>
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-white text-[10px] font-semibold uppercase tracking-wide text-stone-400 sm:h-16 sm:w-16">
                      Conj.
                    </div>
                  )}
                  <div className="min-w-0 flex-1 space-y-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        {line.kind === "catalog" ? (
                          <>
                            <p className="text-sm font-medium leading-snug text-stone-900">
                              {line.product.name}
                            </p>
                            <CatalogPrices
                              product={line.product}
                              quantity={line.quantity}
                            />
                          </>
                        ) : (
                          <>
                            <p className="whitespace-pre-wrap text-sm font-medium leading-snug text-stone-900">
                              {line.productName}
                            </p>
                            {line.pieces.length > 0 ? (
                              <ul className="mt-1 space-y-0.5 text-xs text-stone-500">
                                {line.pieces.map((piece, pieceIdx) => {
                                  const details = [
                                    piece.name,
                                    piece.size,
                                    piece.color,
                                  ].filter(Boolean);
                                  if (details.length === 0) return null;
                                  return (
                                    <li key={`${line.key}-piece-${pieceIdx}`}>
                                      {details.join(" · ")}
                                    </li>
                                  );
                                })}
                              </ul>
                            ) : null}
                            <p className="mt-1.5 text-sm font-semibold tabular-nums text-stone-900">
                              {formatPrice(
                                lineEffectiveUnit(line, paymentMethod) *
                                  line.quantity
                              )}
                            </p>
                          </>
                        )}
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          setOutbound((prev) =>
                            prev.filter((x) => x.key !== line.key)
                          )
                        }
                        className="shrink-0 rounded-md px-1.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
                      >
                        Remover
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          ["REPLACEMENT", "Peça da troca"],
                          ["ADDITIONAL_SALE", "Nova venda"],
                        ] as const
                      ).map(([key, label]) => (
                        <button
                          key={key}
                          type="button"
                          onClick={() =>
                            setOutbound((prev) =>
                              prev.map((x) =>
                                x.key === line.key ? { ...x, lineRole: key } : x
                              )
                            )
                          }
                          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                            line.lineRole === key
                              ? "border-sky-300 bg-sky-100 text-sky-900"
                              : "border-stone-200 bg-white text-stone-600"
                          }`}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-2 sm:grid-cols-[6rem_minmax(0,12rem)]">
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-stone-500">
                          Qtd
                        </p>
                        <input
                          type="number"
                          min={1}
                          value={line.quantity}
                          onChange={(e) => {
                            const quantity = Math.max(
                              1,
                              Number(e.target.value) || 1
                            );
                            setOutbound((prev) =>
                              prev.map((x) =>
                                x.key === line.key ? { ...x, quantity } : x
                              )
                            );
                          }}
                          className="w-full rounded-lg border border-emerald-200 bg-white px-2 py-2 text-sm text-stone-800"
                        />
                      </div>
                      <div>
                        <p className="mb-1 text-[11px] font-medium text-stone-500">
                          Desconto
                        </p>
                        <div className="flex gap-1.5">
                          <select
                            value={line.itemDiscount?.mode ?? "FIXED"}
                            onChange={(e) =>
                              setOutbound((prev) =>
                                prev.map((x) =>
                                  x.key === line.key
                                    ? {
                                        ...x,
                                        itemDiscount: {
                                          mode: e.target.value as
                                            | "FIXED"
                                            | "PERCENT",
                                          value: x.itemDiscount?.value ?? "",
                                        },
                                      }
                                    : x
                                )
                              )
                            }
                            className="w-14 shrink-0 rounded-lg border border-emerald-200 bg-white px-2 py-2 text-sm text-stone-700"
                          >
                            <option value="FIXED">R$</option>
                            <option value="PERCENT">%</option>
                          </select>
                          <input
                            placeholder="0"
                            value={line.itemDiscount?.value ?? ""}
                            onChange={(e) =>
                              setOutbound((prev) =>
                                prev.map((x) =>
                                  x.key === line.key
                                    ? {
                                        ...x,
                                        itemDiscount: {
                                          mode: x.itemDiscount?.mode ?? "FIXED",
                                          value: e.target.value,
                                        },
                                      }
                                    : x
                                )
                              )
                            }
                            className="min-w-0 flex-1 rounded-lg border border-emerald-200 bg-white px-2 py-2 text-sm text-stone-800"
                          />
                        </div>
                      </div>
                    </div>
                    {line.kind === "catalog" &&
                    line.product.pieces.length > 0 ? (
                      <div className="border-t border-emerald-100 pt-3">
                        <p className="mb-1.5 text-[11px] font-medium text-stone-500">
                          Variantes
                        </p>
                        <PieceSelector
                          pieces={line.product.pieces}
                          selections={line.selections}
                          onSelectionsChange={(next) =>
                            setOutbound((prev) =>
                              prev.map((x) =>
                                x.key === line.key && x.kind === "catalog"
                                  ? { ...x, selections: next }
                                  : x
                              )
                            )
                          }
                        />
                      </div>
                    ) : null}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      </>
      ) : (
      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Como enviar
        </h4>
        {outbound.length > 0 ? (
          <p className="text-xs text-stone-500">
            Enviando{" "}
            {outbound
              .map((l) =>
                l.kind === "catalog" ? l.product.name : l.productName
              )
              .join(", ")}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-1.5">
          {(["CARRIER", "LOCAL_COURIER", "STORE_PICKUP"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => applyMethod(key)}
              className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                method === key
                  ? "border-sky-300 bg-sky-100 text-sky-900"
                  : "border-stone-200 bg-white text-stone-600"
              }`}
            >
              {EXCHANGE_SHIPPING_METHOD_LABELS[key]}
            </button>
          ))}
        </div>
        {method === "CARRIER" && (
          <button
            type="button"
            disabled={quoting}
            onClick={() => void quoteFreight()}
            className="text-xs font-medium text-stone-700 underline"
          >
            {quoting ? "Cotando…" : "Atualizar cotação"}
          </button>
        )}
        {method === "CARRIER" && quoting ? (
          <p className="text-xs text-stone-500">Buscando opções de frete…</p>
        ) : null}
        {quoteOptions.length > 0 && method === "CARRIER" && (
          <ul className="space-y-1 rounded-lg border border-stone-100 p-2">
            {quoteOptions.map((opt) => (
              <li key={opt.id}>
                <button
                  type="button"
                  onClick={() => {
                    setServiceId(opt.serviceId);
                    setServiceName(`${opt.carrierName} — ${opt.serviceName}`);
                    setQuotedPrice(opt.price);
                  }}
                  className={`flex w-full justify-between rounded px-2 py-1.5 text-left text-xs hover:bg-stone-50 ${
                    serviceId === opt.serviceId ? "bg-sky-50" : ""
                  }`}
                >
                  <span>
                    {opt.carrierName} — {opt.serviceName}
                  </span>
                  <span>{formatPrice(opt.price)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {method === "CARRIER" && quotedPrice != null && !quoting ? (
          <ShippingPaidByToggle value={paidBy} onChange={setShippingPaidBy} />
        ) : null}
        {method === "LOCAL_COURIER" ? (
          <div className="space-y-2">
            <ShippingPaidByToggle value={paidBy} onChange={setShippingPaidBy} />
            {paidBy === "CUSTOMER" ? (
              <p className="text-xs text-stone-600">
                Frete do moto boy: {formatPrice(LOCAL_COURIER_CUSTOMER_FEE)} no
                saldo da cliente.
              </p>
            ) : (
              <p className="text-xs text-stone-500">
                Frete por conta da loja. Não entra no saldo.
              </p>
            )}
          </div>
        ) : null}
        {method === "CARRIER" &&
        quotedPrice != null &&
        !quoting &&
        paidBy === "STORE" ? (
          <p className="text-xs text-stone-500">
            Frete por conta da loja. Não entra no saldo.
          </p>
        ) : null}
        {customerOwes ? (
          <div className="space-y-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-800/80">
              Pagamento da cliente
            </p>
            <p className="text-sm font-medium text-stone-900">
              Cliente deve {formatPrice(preview.balanceAmount)}
            </p>
            <p className="text-xs text-stone-600">
              Escolha PIX ou cartão. O envio só vai para Envios depois do
              pagamento.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {(
                [
                  ["pix", "PIX"],
                  ["card", "Cartão"],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  disabled={busy || saving || chargeBusy}
                  onClick={() => {
                    setPaymentMethod(key);

                    // Se já estamos "aguardando pagamento" e trocar o método,
                    // regeneramos o link/código imediatamente.
                    if (
                      customerOwes &&
                      chargePayment &&
                      chargePayment.type !== key
                    ) {
                      setChargeBusy(true);
                      setError(null);
                      setCopiedPayment(null);
                      setChargePayment(null);
                      void generateChargePayment(key).finally(() => {
                        setChargeBusy(false);
                      });
                    }
                  }}
                  className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium disabled:opacity-60 ${
                    paymentMethod === key
                      ? "border-sky-300 bg-sky-100 text-sky-900"
                      : "border-stone-200 bg-white text-stone-600"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
            {chargePayment?.type === "pix" ? (
              <div className="space-y-2 rounded-lg border border-amber-100 bg-white p-3">
                <p className="text-sm font-medium text-stone-900">
                  PIX · {formatPrice(chargePayment.amount)}
                </p>
                {chargePayment.pixQrBase64 ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={`data:image/png;base64,${chargePayment.pixQrBase64}`}
                    alt="QR Code PIX"
                    className="mx-auto h-40 w-40"
                  />
                ) : null}
                <textarea
                  readOnly
                  value={chargePayment.pixCode}
                  className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
                  rows={3}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  disabled={chargeBusy}
                  onClick={() =>
                    void copyPaymentText(chargePayment.pixCode, "pix")
                  }
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-60"
                >
                  {copiedPayment === "pix" ? "Mensagem copiada!" : "Copiar link Pix"}
                </button>
                <p className="text-xs text-stone-500">Aguardando pagamento…</p>
              </div>
            ) : null}
            {chargePayment?.type === "card" ? (
              <div className="space-y-2 rounded-lg border border-amber-100 bg-white p-3">
                <textarea
                  readOnly
                  value={chargePayment.checkoutUrl}
                  className="w-full rounded-lg border border-stone-200 px-2 py-1.5 text-xs"
                  rows={3}
                  onFocus={(e) => e.currentTarget.select()}
                />
                <button
                  type="button"
                  disabled={chargeBusy}
                  onClick={() =>
                    void copyPaymentText(chargePayment.checkoutUrl, "card")
                  }
                  className="rounded-lg border border-stone-200 bg-white px-3 py-1.5 text-xs font-medium text-stone-700 transition-colors hover:bg-stone-50 disabled:opacity-60"
                >
                  {copiedPayment === "card"
                    ? "Mensagem copiada!"
                    : "Copiar link cartão"}
                </button>
                <p className="text-xs text-stone-500">Aguardando pagamento…</p>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
      )}
    </AdminModal>
  );
}

function ShippingPaidByToggle({
  value,
  onChange,
}: {
  value: "CUSTOMER" | "STORE";
  onChange: (v: "CUSTOMER" | "STORE") => void;
}) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-stone-600">Quem paga o frete</p>
      <div className="flex flex-wrap gap-1.5">
        {(
          [
            ["CUSTOMER", "Cobrar do cliente"],
            ["STORE", "Pago pela loja"]
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
              value === key
                ? "border-sky-300 bg-sky-100 text-sky-900"
                : "border-stone-200 bg-white text-stone-600"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
