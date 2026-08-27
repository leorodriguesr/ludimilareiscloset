"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import {
  EXCHANGE_REASON_LABELS,
  EXCHANGE_REASONS,
} from "@/lib/exchanges/constants";
import { computeExchangeBalance } from "@/lib/exchanges/balance";
import { parsePieceSelections } from "@/lib/exchanges/serialize";
import {
  isSamePieceSwap,
  productIdentityKey,
} from "@/lib/exchanges/product-diff";
import type { CartPieceSelection } from "@/lib/cart/types";
import {
  defaultExchangeShippingMethodForOrder,
  EXCHANGE_RETURN_METHOD_LABELS,
  EXCHANGE_SHIPPING_METHOD_LABELS,
  exchangeShippingMethodServiceName,
  isLocalExchangeShippingMethod,
} from "@/lib/exchanges/shipping-method";
import { resolveArrangedDeliveryDisplay } from "@/lib/admin-sale/arranged-delivery";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import type {
  ExchangeReason,
  ExchangeShippingMethod,
} from "@/app/generated/prisma/client";
import {
  CustomSaleSetsForm,
  type CustomSaleSetInput,
} from "@/components/admin/CustomSaleSetsForm";

type OrderItem = {
  id: string;
  productId: string | null;
  productName: string;
  productImageUrl: string | null;
  quantity: number;
  price: number;
  pieceSelectionsJson: string | null;
};

type PaidOrder = {
  id: string;
  orderNumber: number | null;
  recipientName: string | null;
  email: string | null;
  destinationCep: string | null;
  total: number;
  paidAt: string | null;
  fulfillmentType?: "CARRIER" | "ARRANGED" | null;
  shippingServiceName?: string | null;
  deliveryNotes?: string | null;
  shippingAmount?: number | null;
  items: OrderItem[];
};

type CatalogProduct = {
  id: string;
  name: string;
  price: number;
  pixPrice?: number | null;
  images?: { url: string }[];
  pieces?: {
    name: string;
    colors: { name: string }[];
    sizes: { name: string }[];
  }[];
};

type OutboundCatalogDraft = {
  key: string;
  kind: "catalog";
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  pieceSelections?: {
    pieceName: string;
    size: string | null;
    color: string | null;
  }[];
};

type OutboundCustomDraft = {
  key: string;
  kind: "custom";
  productName: string;
  quantity: number;
  unitPrice: number;
  pieces: CustomSaleSetInput["pieces"];
};

type OutboundDraft = OutboundCatalogDraft | OutboundCustomDraft;

type ShippingDraft = {
  method: ExchangeShippingMethod;
  serviceId: number | null;
  serviceName: string | null;
  quotedPrice: number | null;
  paidBy: "STORE" | "CUSTOMER";
  packageHeightCm?: number | null;
  packageWidthCm?: number | null;
  packageLengthCm?: number | null;
  packageWeightKg?: number | null;
};

function shippingDraftForMethod(
  method: ExchangeShippingMethod,
  paidBy: "STORE" | "CUSTOMER" = "STORE"
): ShippingDraft {
  if (isLocalExchangeShippingMethod(method)) {
    return {
      method,
      serviceId: null,
      serviceName: exchangeShippingMethodServiceName(method),
      quotedPrice: 0,
      paidBy,
    };
  }
  return {
    method: "CARRIER",
    serviceId: null,
    serviceName: null,
    quotedPrice: null,
    paidBy,
  };
}

function formatPieceLabel(piece: CartPieceSelection): string {
  return [piece.pieceName, piece.color, piece.size].filter(Boolean).join(" · ");
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

type ReturnUnit = {
  key: string;
  orderItemId: string;
  productId: string | null;
  identification: string;
  pieceLabel: string;
  pieceSelection: CartPieceSelection | null;
};

type ReturnCard = {
  orderItemId: string;
  identification: string;
  productId: string | null;
  itemQuantity: number;
  productTotal: number;
  units: ReturnUnit[];
};

function buildReturnCards(items: OrderItem[]): ReturnCard[] {
  return items.map((item) => {
    const pieces = parsePieceSelections(item.pieceSelectionsJson);
    const pieceRows: Array<CartPieceSelection | null> =
      pieces.length > 0 ? pieces : [null];
    const units: ReturnUnit[] = [];
    for (let copy = 0; copy < item.quantity; copy++) {
      for (let index = 0; index < pieceRows.length; index++) {
        const piece = pieceRows[index];
        units.push({
          key: `${item.id}:${copy}:${index}`,
          orderItemId: item.id,
          productId: item.productId,
          identification: item.productName,
          pieceLabel: piece ? formatPieceLabel(piece) : item.productName,
          pieceSelection: piece,
        });
      }
    }
    return {
      orderItemId: item.id,
      identification: item.productName,
      productId: item.productId,
      itemQuantity: item.quantity,
      productTotal: roundMoney(item.price * item.quantity),
      units,
    };
  });
}

function SelectionDot({ selected }: { selected: boolean }) {
  return (
    <span
      className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
        selected ? "border-sky-600 bg-sky-600" : "border-stone-300 bg-white"
      }`}
      aria-hidden
    >
      {selected ? <span className="h-1.5 w-1.5 rounded-full bg-white" /> : null}
    </span>
  );
}

function formatPaidDate(iso: string | null): string | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function SearchIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      viewBox="0 0 24 24"
      aria-hidden
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="m21 21-4.35-4.35M17 11a6 6 0 1 1-12 0 6 6 0 0 1 12 0Z"
      />
    </svg>
  );
}

function ExchangeOrderResultRow({
  order,
  selected,
  onSelect,
}: {
  order: PaidOrder;
  selected: boolean;
  onSelect: () => void;
}) {
  const shipHint =
    order.fulfillmentType === "ARRANGED"
      ? resolveArrangedDeliveryDisplay({
          shippingServiceName: order.shippingServiceName,
          deliveryNotes: order.deliveryNotes,
          shippingAmount: order.shippingAmount ?? 0,
        }).typeLabel
      : "Transportadora";
  const itemCount = order.items.reduce((sum, item) => sum + item.quantity, 0);
  const customer =
    order.recipientName?.trim() || order.email?.trim() || "Sem nome";
  const paidLabel = formatPaidDate(order.paidAt);

  return (
    <tr
      className={`cursor-pointer border-b border-stone-100 last:border-b-0 ${
        selected ? "bg-stone-50" : "bg-white hover:bg-stone-50/80"
      }`}
      onClick={onSelect}
    >
      <td className="w-10 px-3 py-3">
        <span
          className={`flex h-4 w-4 items-center justify-center rounded-full border ${
            selected
              ? "border-sky-600 bg-sky-600"
              : "border-stone-300 bg-white"
          }`}
          aria-hidden
        >
          {selected ? (
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          ) : null}
        </span>
      </td>
      <td className="whitespace-nowrap px-2 py-3">
        <p className="font-mono text-sm font-medium text-stone-900">
          #{order.orderNumber ?? order.id.slice(0, 6)}
        </p>
        {paidLabel ? (
          <p className="text-[11px] text-stone-400">{paidLabel}</p>
        ) : null}
      </td>
      <td className="min-w-0 px-2 py-3">
        <p className="truncate text-sm text-stone-800">{customer}</p>
        <p className="text-[11px] text-stone-400">
          {itemCount === 1 ? "1 peça" : `${itemCount} peças`}
        </p>
      </td>
      <td className="hidden whitespace-nowrap px-2 py-3 text-xs text-stone-500 sm:table-cell">
        {shipHint}
      </td>
      <td className="whitespace-nowrap px-3 py-3 text-right text-sm font-medium tabular-nums text-stone-900">
        {formatPrice(order.total)}
      </td>
    </tr>
  );
}

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (exchangeId: string) => void;
};

type WizardKind = "EXCHANGE" | "RETURN";

const STEPS_EXCHANGE = [
  "Pedido",
  "Devolver",
  "Motivo",
  "Logística",
  "Confirmar",
] as const;

const STEPS_RETURN = [
  "Pedido",
  "Devolver",
  "Motivo",
  "Logística",
  "Confirmar",
] as const;

export function ExchangeWizard({ open, onClose, onCreated }: Props) {
  const [kind, setKind] = useState<WizardKind>("EXCHANGE");
  const [step, setStep] = useState(0);
  const steps = kind === "RETURN" ? STEPS_RETURN : STEPS_EXCHANGE;
  const [orders, setOrders] = useState<PaidOrder[]>([]);
  const [ordersLoading, setOrdersLoading] = useState(false);
  const [orderQuery, setOrderQuery] = useState("");
  const [selectedOrder, setSelectedOrder] = useState<PaidOrder | null>(null);
  const [selectedReturnKeys, setSelectedReturnKeys] = useState<
    Record<string, boolean>
  >({});
  const [refundInput, setRefundInput] = useState("");
  const [outbound, setOutbound] = useState<OutboundDraft[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [showCustomSets, setShowCustomSets] = useState(false);
  const [reason, setReason] = useState<ExchangeReason | null>(null);
  const [reasonNotes, setReasonNotes] = useState("");
  const [notes, setNotes] = useState("");
  const [returnShipping, setReturnShipping] = useState<ShippingDraft>(
    shippingDraftForMethod("CARRIER")
  );
  const [outboundShipping, setOutboundShipping] = useState<ShippingDraft>(
    shippingDraftForMethod("CARRIER")
  );
  const [quoteOptions, setQuoteOptions] = useState<NormalizedShippingOption[]>(
    []
  );
  const [quoting, setQuoting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reset = useCallback(() => {
    setKind("EXCHANGE");
    setStep(0);
    setOrderQuery("");
    setOrders([]);
    setSelectedOrder(null);
    setSelectedReturnKeys({});
    setRefundInput("");
    setOutbound([]);
    setProductQuery("");
    setShowCustomSets(false);
    setReason(null);
    setReasonNotes("");
    setNotes("");
    setReturnShipping(shippingDraftForMethod("CARRIER"));
    setOutboundShipping(shippingDraftForMethod("CARRIER"));
    setQuoteOptions([]);
    setError(null);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    void (async () => {
      try {
        const res = await fetch("/api/products");
        const data: unknown = await res.json();
        setProducts(Array.isArray(data) ? (data as CatalogProduct[]) : []);
      } catch {
        setProducts([]);
      }
    })();
  }, [open, reset]);

  useEffect(() => {
    if (!open) return;
    const q = orderQuery.trim();
    const withoutHash = q.replace(/^#/, "").trim();
    const ready =
      /^\d+$/.test(withoutHash) || q.length >= 2;
    if (!ready) {
      setOrders([]);
      setOrdersLoading(false);
      return;
    }

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        setOrdersLoading(true);
        try {
          const res = await fetch(
            `/api/admin/exchanges/orders?${new URLSearchParams({ q })}`,
            { signal: controller.signal }
          );
          const data = (await res.json()) as { orders?: PaidOrder[] };
          if (!controller.signal.aborted) {
            setOrders(Array.isArray(data.orders) ? data.orders : []);
          }
        } catch (e) {
          if ((e as { name?: string }).name === "AbortError") return;
          setOrders([]);
        } finally {
          if (!controller.signal.aborted) setOrdersLoading(false);
        }
      })();
    }, 250);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [open, orderQuery]);

  const returnCards = useMemo(
    () => (selectedOrder ? buildReturnCards(selectedOrder.items) : []),
    [selectedOrder]
  );

  const returnUnits = useMemo(
    () => returnCards.flatMap((card) => card.units),
    [returnCards]
  );

  const selectedReturnUnits = useMemo(
    () => returnUnits.filter((unit) => selectedReturnKeys[unit.key]),
    [returnUnits, selectedReturnKeys]
  );

  const returnLines = useMemo(
    () =>
      selectedReturnUnits.map((unit) => ({
        orderItemId: unit.orderItemId,
        quantity: 1,
        productName: unit.pieceLabel,
        productId: unit.productId,
        pieceSelections: unit.pieceSelection ? [unit.pieceSelection] : undefined,
      })),
    [selectedReturnUnits]
  );

  const refundAmount = useMemo(() => {
    const n = Number(refundInput.trim().replace(",", "."));
    return Number.isFinite(n) ? roundMoney(n) : NaN;
  }, [refundInput]);

  const refundReady =
    refundInput.trim() !== "" && Number.isFinite(refundAmount) && refundAmount >= 0;

  const selectedReturnCards = useMemo(
    () =>
      returnCards
        .map((card) => ({
          ...card,
          selectedCount: card.units.filter((unit) => selectedReturnKeys[unit.key])
            .length,
        }))
        .filter((card) => card.selectedCount > 0),
    [returnCards, selectedReturnKeys]
  );

  const samePieceSwap = useMemo(() => {
    if (kind !== "EXCHANGE" || outbound.length === 0) return false;
    return isSamePieceSwap({
      returned: selectedReturnCards.map((card) => ({
        key: productIdentityKey(card.productId, card.identification),
        quantity: card.itemQuantity,
      })),
      outbound: outbound.map((line) => ({
        key: productIdentityKey(
          line.kind === "catalog" ? line.productId : null,
          line.productName
        ),
        quantity: line.quantity,
      })),
      allReturnItemsFullySelected: selectedReturnCards.every(
        (card) => card.selectedCount === card.units.length
      ),
    });
  }, [kind, outbound, selectedReturnCards]);

  const exchangeReturnedTotal = useMemo(
    () =>
      roundMoney(
        selectedReturnCards.reduce((sum, card) => {
          const share =
            card.units.length > 0
              ? (card.selectedCount / card.units.length) * card.productTotal
              : 0;
          return sum + share;
        }, 0)
      ),
    [selectedReturnCards]
  );

  const exchangeNewTotal = useMemo(
    () =>
      roundMoney(
        outbound.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0)
      ),
    [outbound]
  );

  const returnedItemsTotal =
    kind === "RETURN" && refundReady
      ? refundAmount
      : kind === "EXCHANGE"
        ? exchangeReturnedTotal
        : 0;
  const newItemsTotal = kind === "EXCHANGE" ? exchangeNewTotal : 0;

  const exchangeReturnPaidBy = kind === "EXCHANGE" ? "STORE" : returnShipping.paidBy;
  const exchangeOutboundPaidBy =
    kind === "EXCHANGE" ? "CUSTOMER" : outboundShipping.paidBy;

  const balancePreview = useMemo(
    () =>
      computeExchangeBalance({
        returnedItemsTotal,
        newItemsTotal,
        samePieceSwap,
        shippings: [
          {
            quotedPrice: returnShipping.quotedPrice,
            paidBy: exchangeReturnPaidBy,
          },
          ...(outbound.length > 0
            ? [
                {
                  quotedPrice: outboundShipping.quotedPrice,
                  paidBy: exchangeOutboundPaidBy,
                },
              ]
            : []),
        ],
      }),
    [
      returnedItemsTotal,
      newItemsTotal,
      samePieceSwap,
      returnShipping.quotedPrice,
      outboundShipping.quotedPrice,
      exchangeReturnPaidBy,
      exchangeOutboundPaidBy,
      outbound.length,
    ]
  );

  const filteredProducts = useMemo(() => {
    const q = productQuery.trim().toLowerCase();
    if (!q) return products.slice(0, 30);
    return products
      .filter((p) => p.name.toLowerCase().includes(q))
      .slice(0, 30);
  }, [products, productQuery]);

  const orderIsArranged = selectedOrder?.fulfillmentType === "ARRANGED";
  const arrangedLabel = selectedOrder
    ? resolveArrangedDeliveryDisplay({
        shippingServiceName: selectedOrder.shippingServiceName,
        deliveryNotes: selectedOrder.deliveryNotes,
        shippingAmount: selectedOrder.shippingAmount ?? 0,
      }).typeLabel
    : null;

  useEffect(() => {
    if (!selectedOrder) return;
    const method = defaultExchangeShippingMethodForOrder(selectedOrder);
    setReturnShipping(shippingDraftForMethod(method, "STORE"));
    setOutboundShipping(
      shippingDraftForMethod(
        method,
        kind === "EXCHANGE" ? "CUSTOMER" : "STORE"
      )
    );
    setQuoteOptions([]);
  }, [selectedOrder, kind]);

  async function quoteFor(
    shipKind: "RETURN" | "OUTBOUND",
    lines: { productId: string; quantity: number }[]
  ) {
    if (!selectedOrder?.destinationCep) {
      setError("Pedido sem CEP de destino.");
      return;
    }
    if (
      (shipKind === "RETURN" && returnShipping.method !== "CARRIER") ||
      (shipKind === "OUTBOUND" && outboundShipping.method !== "CARRIER")
    ) {
      setError("Cotação SuperFrete só para transportadora.");
      return;
    }
    setQuoting(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/exchanges/quote-shipping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationCep: selectedOrder.destinationCep,
          lines:
            lines.length > 0
              ? lines
              : [{ productId: selectedOrder.items[0]?.productId, quantity: 1 }],
        }),
      });
      const data = (await res.json()) as {
        options?: NormalizedShippingOption[];
        error?: string;
        idealPackage?: {
          heightCm?: number;
          widthCm?: number;
          lengthCm?: number;
          weightKg?: number;
        } | null;
      };
      if (!res.ok) {
        setError(data.error ?? "Falha ao cotar frete.");
        return;
      }
      const options = data.options ?? [];
      setQuoteOptions(options);
      const cheapest = [...options].sort((a, b) => a.price - b.price)[0];
      if (cheapest) {
        const draft: ShippingDraft = {
          method: "CARRIER",
          serviceId: cheapest.serviceId,
          serviceName: `${cheapest.carrierName} — ${cheapest.serviceName}`,
          quotedPrice: cheapest.price,
          paidBy:
            shipKind === "RETURN"
              ? kind === "EXCHANGE"
                ? "STORE"
                : returnShipping.paidBy
              : kind === "EXCHANGE"
                ? "CUSTOMER"
                : outboundShipping.paidBy,
          packageHeightCm: data.idealPackage?.heightCm ?? null,
          packageWidthCm: data.idealPackage?.widthCm ?? null,
          packageLengthCm: data.idealPackage?.lengthCm ?? null,
          packageWeightKg: data.idealPackage?.weightKg ?? null,
        };
        if (shipKind === "RETURN") setReturnShipping(draft);
        else setOutboundShipping(draft);
      }
    } finally {
      setQuoting(false);
    }
  }

  /** Índice de conteúdo: 0 Pedido, 1 Devolver, 2 Enviar (não usado), 3 Motivo, 4 Frete, 5 Confirmar. */
  function logicalStep(uiStep: number): number {
    if (uiStep <= 1) return uiStep;
    return uiStep + 1;
  }

  function canNext(): boolean {
    const s = logicalStep(step);
    if (s === 0) return !!selectedOrder;
    if (s === 1) {
      if (returnLines.length === 0) return false;
      if (kind === "RETURN") return refundReady;
      return true;
    }
    if (s === 3) return !!reason && (reason !== "OTHER" || !!reasonNotes.trim());
    if (kind === "RETURN" && s === 5) return refundReady;
    return true;
  }

  function goNext() {
    setStep((s) => Math.min(steps.length - 1, s + 1));
  }

  function goBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    if (!selectedOrder || !reason) return;
    setSubmitting(true);
    setError(null);
    try {
      const shippings: {
        type: "RETURN" | "OUTBOUND";
        method: ExchangeShippingMethod;
        shippingServiceId: number | null;
        shippingServiceName: string | null;
        quotedPrice: number | null;
        paidBy: "STORE" | "CUSTOMER";
        packageHeightCm?: number | null;
        packageWidthCm?: number | null;
        packageLengthCm?: number | null;
        packageWeightKg?: number | null;
      }[] = [
        {
          type: "RETURN",
          method: returnShipping.method,
          shippingServiceId: returnShipping.serviceId,
          shippingServiceName: returnShipping.serviceName,
          quotedPrice: returnShipping.quotedPrice,
          paidBy: kind === "EXCHANGE" ? "STORE" : returnShipping.paidBy,
          packageHeightCm: returnShipping.packageHeightCm,
          packageWidthCm: returnShipping.packageWidthCm,
          packageLengthCm: returnShipping.packageLengthCm,
          packageWeightKg: returnShipping.packageWeightKg,
        },
      ];

      const res = await fetch("/api/admin/exchanges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          kind,
          reason,
          reasonNotes: reasonNotes.trim() || null,
          notes: reason === "OTHER" ? null : notes.trim() || null,
          refundAmount: kind === "RETURN" ? refundAmount : undefined,
          returnLines: returnLines.map((l) => ({
            orderItemId: l.orderItemId,
            quantity: l.quantity,
            pieceSelections: l.pieceSelections,
          })),
          outboundLines: [],
          shippings,
        }),
      });
      const data = (await res.json()) as {
        exchange?: { id: string };
        error?: string;
      };
      if (!res.ok || !data.exchange) {
        setError(
          data.error ??
            (kind === "RETURN"
              ? "Não foi possível criar a devolução."
              : "Não foi possível criar a troca.")
        );
        return;
      }

      onCreated(data.exchange.id);
      onClose();
    } catch {
      setError("Erro de rede ao criar troca.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) return null;

  const contentStep = logicalStep(step);

  return (
    <div className="fixed inset-0 z-50 flex bg-stone-900/50 backdrop-blur-sm">
      <div className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white md:m-auto md:h-[min(42rem,calc(100dvh-2rem))] md:max-h-[min(42rem,calc(100dvh-2rem))] md:w-full md:max-w-2xl md:rounded-2xl md:border md:border-stone-200 md:shadow-2xl">
        <div className="flex shrink-0 items-center justify-between border-b border-stone-100 px-4 py-4 sm:px-6">
          <div className="min-w-0 pr-3">
            <h2 className="truncate text-base font-semibold text-stone-900 sm:text-lg">
              {kind === "RETURN" ? "Nova devolução" : "Nova troca"}
            </h2>
            <p className="mt-0.5 truncate text-xs text-stone-500 sm:text-sm">
              {steps[step]} · {step + 1}/{steps.length}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-lg p-2 text-stone-400 transition-colors hover:bg-stone-100 hover:text-stone-700"
            aria-label="Fechar"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="shrink-0 border-b border-stone-100 px-3 py-3 sm:px-6">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ["EXCHANGE", "Troca"],
                ["RETURN", "Só devolução"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setKind(key);
                  setOutbound([]);
                  setRefundInput("");
                  setStep(0);
                  setReturnShipping((s) =>
                    shippingDraftForMethod(
                      s.method,
                      key === "EXCHANGE" ? "STORE" : s.paidBy
                    )
                  );
                  setOutboundShipping((s) =>
                    shippingDraftForMethod(
                      s.method,
                      key === "EXCHANGE" ? "CUSTOMER" : "STORE"
                    )
                  );
                }}
                className={`rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors ${
                  kind === key
                    ? "border-sky-300 bg-sky-100 text-sky-900"
                    : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {kind === "RETURN" ? (
            <p className="mt-2 text-xs text-stone-500">
              Informe o valor a restituir. Depois da conferência, confirme a
              restituição.
            </p>
          ) : (
            <p className="mt-2 text-xs text-stone-500">
              Cadastre as peças e o frete reverso (loja). O envio e a cobrança
              da cliente ficam para depois da conferência.
            </p>
          )}
        </div>

        <div className="shrink-0 border-b border-stone-100 bg-stone-50/80 px-3 py-3 sm:px-6">
          <ol className="flex w-full items-start gap-0 overflow-x-auto overscroll-x-contain p-0.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {steps.map((label, i) => {
              const active = i === step;
              const done = i < step;
              const isLast = i === steps.length - 1;
              return (
                <li key={label} className="flex min-w-0 flex-1 items-start">
                  <div className="flex w-full min-w-[4.5rem] flex-col items-center gap-1.5 sm:min-w-0">
                    <div className="flex w-full items-center">
                      {i > 0 ? (
                        <span
                          className={`h-px flex-1 ${
                            done || active ? "bg-stone-400" : "bg-stone-200"
                          }`}
                          aria-hidden
                        />
                      ) : (
                        <span className="flex-1" aria-hidden />
                      )}
                      <span
                        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold sm:h-8 sm:w-8 sm:text-xs ${
                          active
                            ? "bg-stone-900 text-white ring-4 ring-stone-900/10"
                            : done
                              ? "bg-stone-800 text-white"
                              : "border border-stone-200 bg-white text-stone-400"
                        }`}
                      >
                        {done ? (
                          <svg
                            className="h-3.5 w-3.5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth={2.5}
                            viewBox="0 0 24 24"
                            aria-hidden
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="m4.5 12.75 6 6 9-13.5"
                            />
                          </svg>
                        ) : (
                          i + 1
                        )}
                      </span>
                      {!isLast ? (
                        <span
                          className={`h-px flex-1 ${
                            done ? "bg-stone-400" : "bg-stone-200"
                          }`}
                          aria-hidden
                        />
                      ) : (
                        <span className="flex-1" aria-hidden />
                      )}
                    </div>
                    <span
                      className={`max-w-full px-0.5 text-center text-[10px] font-medium leading-tight sm:text-[11px] ${
                        active
                          ? "text-stone-900"
                          : done
                            ? "text-stone-600"
                            : "text-stone-400"
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>

        <div
          className={`flex min-h-0 flex-1 flex-col px-4 py-4 sm:px-6 sm:py-5 ${
            contentStep === 0
              ? "overflow-hidden"
              : "overflow-y-auto overscroll-contain"
          }`}
        >
          {error && (
            <div className="mb-3 shrink-0 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {contentStep === 0 && (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              <div className="relative shrink-0">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
                <input
                  value={orderQuery}
                  onChange={(e) => setOrderQuery(e.target.value)}
                  placeholder="Nº do pedido, nome ou e-mail"
                  className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
                />
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                {ordersLoading ? (
                  <div className="rounded-xl border border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500">
                    Buscando pedidos entregues…
                  </div>
                ) : !orderQuery.trim() ? (
                  <div className="rounded-xl border border-dashed border-stone-200 px-4 py-10 text-center">
                    <p className="text-sm font-medium text-stone-700">
                      Busque o pedido da cliente
                    </p>
                    <p className="mt-1 text-xs leading-relaxed text-stone-500">
                      Só entram pedidos pagos e já entregues.
                    </p>
                  </div>
                ) : !/^\d+$/.test(orderQuery.trim().replace(/^#/, "").trim()) &&
                  orderQuery.trim().length < 2 ? (
                  <p className="px-1 text-sm text-stone-500">
                    Digite pelo menos 2 caracteres para buscar por nome ou
                    e-mail.
                  </p>
                ) : orders.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-stone-200 px-4 py-10 text-center text-sm text-stone-500">
                    Nenhum pedido entregue encontrado.
                  </div>
                ) : (
                  <div className="overflow-hidden rounded-xl border border-stone-200">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 z-[1] bg-stone-50/95 text-xs font-medium text-stone-500 backdrop-blur-sm">
                        <tr className="border-b border-stone-200">
                          <th className="w-10 px-3 py-2.5" />
                          <th className="px-2 py-2.5 text-left">Pedido</th>
                          <th className="px-2 py-2.5 text-left">Cliente</th>
                          <th className="hidden px-2 py-2.5 text-left sm:table-cell">
                            Entrega
                          </th>
                          <th className="px-3 py-2.5 text-right">Total</th>
                        </tr>
                      </thead>
                      <tbody>
                        {orders.map((o) => (
                          <ExchangeOrderResultRow
                            key={o.id}
                            order={o}
                            selected={selectedOrder?.id === o.id}
                            onSelect={() => {
                              setSelectedOrder(o);
                              setSelectedReturnKeys({});
                              setRefundInput("");
                              setOutbound([]);
                            }}
                          />
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}

          {contentStep === 1 && selectedOrder && (
            <div className="space-y-3">
              <p className="text-sm text-stone-600">
                {kind === "RETURN"
                  ? "Marque as peças e informe o valor a reembolsar desta venda."
                  : "Marque as peças que voltam. Na troca, o saldo considera só o frete."}
              </p>
              <div className="space-y-3">
                {returnCards.map((card) => {
                  const selectedCount = card.units.filter(
                    (unit) => selectedReturnKeys[unit.key]
                  ).length;
                  const allSelected =
                    card.units.length > 0 &&
                    selectedCount === card.units.length;
                  return (
                    <div
                      key={card.orderItemId}
                      className="overflow-hidden rounded-xl border border-stone-200"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedReturnKeys((prev) => {
                            const next = { ...prev };
                            for (const unit of card.units) {
                              next[unit.key] = !allSelected;
                            }
                            return next;
                          });
                        }}
                        className={`flex w-full items-start gap-3 px-3 py-3 text-left ${
                          allSelected ? "bg-stone-50" : "bg-white"
                        }`}
                      >
                        <SelectionDot selected={allSelected} />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-stone-900">
                            {card.identification}
                          </p>
                          <p className="mt-0.5 text-[11px] text-stone-400">
                            {card.units.length === 1
                              ? "1 peça"
                              : `${card.units.length} peças`}
                            {selectedCount > 0 && selectedCount < card.units.length
                              ? ` · ${selectedCount} selecionada(s)`
                              : ""}
                          </p>
                        </div>
                        {kind === "RETURN" ? (
                          <span className="shrink-0 text-sm font-medium tabular-nums text-stone-900">
                            {formatPrice(card.productTotal)}
                          </span>
                        ) : null}
                      </button>
                      <ul className="border-t border-stone-100">
                        {card.units.map((unit) => {
                          const selected = Boolean(selectedReturnKeys[unit.key]);
                          return (
                            <li key={unit.key}>
                              <button
                                type="button"
                                onClick={() =>
                                  setSelectedReturnKeys((prev) => ({
                                    ...prev,
                                    [unit.key]: !prev[unit.key],
                                  }))
                                }
                                className={`flex w-full items-center gap-3 px-3 py-2.5 pl-6 text-left ${
                                  selected
                                    ? "bg-stone-50"
                                    : "bg-white hover:bg-stone-50/80"
                                }`}
                              >
                                <SelectionDot selected={selected} />
                                <p className="min-w-0 truncate text-sm text-stone-700">
                                  {unit.pieceLabel}
                                </p>
                              </button>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  );
                })}
              </div>
              {kind === "RETURN" ? (
                <label className="block space-y-1.5">
                  <span className="text-sm font-medium text-stone-800">
                    Valor a reembolsar
                  </span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={refundInput}
                    onChange={(e) => setRefundInput(e.target.value)}
                    placeholder="0,00"
                    className="box-border h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm font-medium tabular-nums text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
                  />
                  <span className="block text-[11px] text-stone-400">
                    Informe o valor desta venda. Não é calculado pelas peças.
                  </span>
                </label>
              ) : null}
            </div>
          )}

          {contentStep === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">
                  Itens de saída
                </h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  Se for a mesma peça (só tamanho ou cor), não há diferença de
                  produto. Produto diferente gera cobrança ou restituição. O
                  retorno é por conta da loja; o envio, da cliente.
                </p>
              </div>

              <div className="flex flex-col gap-1.5 sm:flex-row sm:items-center">
                <div className="relative min-w-0 flex-1">
                  <input
                    value={productQuery}
                    onChange={(e) => setProductQuery(e.target.value)}
                    placeholder="Buscar produto do catálogo…"
                    className="box-border h-8 w-full rounded-lg border border-stone-200 bg-white px-2.5 text-xs font-medium text-stone-900 placeholder:text-stone-400 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
                  />
                  {productQuery.trim() && (
                    <ul className="absolute left-0 right-0 z-20 mt-1.5 max-h-48 overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
                      {filteredProducts.length === 0 ? (
                        <li className="px-2.5 py-3 text-center text-xs text-stone-400">
                          Nenhum produto encontrado.
                        </li>
                      ) : (
                        filteredProducts.map((p) => (
                          <li key={p.id}>
                            <button
                              type="button"
                              onClick={() => {
                                const unitPrice = p.pixPrice ?? p.price;
                                setOutbound((prev) => [
                                  ...prev,
                                  {
                                    key: `${p.id}-${Date.now()}`,
                                    kind: "catalog",
                                    productId: p.id,
                                    productName: p.name,
                                    quantity: 1,
                                    unitPrice,
                                  },
                                ]);
                                setProductQuery("");
                                setShowCustomSets(false);
                              }}
                              className="flex w-full items-center justify-between rounded-md px-2.5 py-2 text-left text-xs hover:bg-stone-50"
                            >
                              <span className="truncate font-medium text-stone-900">
                                {p.name}
                              </span>
                              <span className="shrink-0 text-[11px] text-stone-500">
                                {formatPrice(p.pixPrice ?? p.price)}
                              </span>
                            </button>
                          </li>
                        ))
                      )}
                    </ul>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => setShowCustomSets((v) => !v)}
                  className={`inline-flex h-8 shrink-0 items-center justify-center gap-1 rounded-lg border px-2.5 text-xs font-semibold transition-colors ${
                    showCustomSets
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

              {showCustomSets && (
                <CustomSaleSetsForm
                  compact
                  title="Produto sem cadastro"
                  descriptionLabel="O que será enviado?"
                  submitLabel="Adicionar à troca"
                  onCancel={() => setShowCustomSets(false)}
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
                      })),
                    ]);
                    setShowCustomSets(false);
                  }}
                />
              )}

              {outbound.length === 0 ? (
                <div className="rounded-xl border border-dashed border-stone-200 px-4 py-8 text-center">
                  <p className="text-sm text-stone-500">
                    Selecione o que será enviado na troca.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2">
                  {outbound.map((line) => (
                    <li
                      key={line.key}
                      className="flex items-center gap-3 rounded-xl border border-stone-200 px-3 py-3"
                    >
                      <div
                        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-lg text-[10px] font-semibold uppercase tracking-wide ${
                          line.kind === "custom"
                            ? "bg-stone-100 text-stone-400"
                            : "bg-sky-50 text-sky-700"
                        }`}
                      >
                        {line.kind === "custom" ? "Conj." : "Cat."}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-stone-900">
                          {line.productName}
                        </p>
                        <p className="text-xs text-stone-500">
                          {formatPrice(line.unitPrice)}
                          {line.kind === "custom" && line.pieces.length > 0
                            ? ` · ${line.pieces.length} peça(s)`
                            : line.kind === "catalog"
                              ? " · Catálogo"
                              : ""}
                        </p>
                      </div>
                      <input
                        type="number"
                        min={1}
                        value={line.quantity}
                        onChange={(e) =>
                          setOutbound((prev) =>
                            prev.map((x) =>
                              x.key === line.key
                                ? {
                                    ...x,
                                    quantity: Math.max(
                                      1,
                                      Math.floor(Number(e.target.value) || 1)
                                    ),
                                  }
                                : x
                            )
                          )
                        }
                        className="w-14 rounded-lg border border-stone-200 px-2 py-1 text-center text-sm"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setOutbound((prev) =>
                            prev.filter((x) => x.key !== line.key)
                          )
                        }
                        className="text-xs font-medium text-red-600"
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {kind === "EXCHANGE" && outbound.length > 0 ? (
                <div className="space-y-2 rounded-xl border border-stone-200 bg-stone-50 px-3 py-3 text-sm">
                  <p className="font-medium text-stone-900">
                    {samePieceSwap
                      ? "Mesma peça (tamanho ou cor) — sem diferença de produto"
                      : "Produto diferente — diferença de valor"}
                  </p>
                  {!samePieceSwap ? (
                    <div className="space-y-1 text-xs text-stone-600">
                      <p className="flex justify-between gap-3">
                        <span>Devolução</span>
                        <span className="tabular-nums">
                          {formatPrice(exchangeReturnedTotal)}
                        </span>
                      </p>
                      <p className="flex justify-between gap-3">
                        <span>Novo produto</span>
                        <span className="tabular-nums">
                          {formatPrice(exchangeNewTotal)}
                        </span>
                      </p>
                      <p className="flex justify-between gap-3 font-medium text-stone-800">
                        <span>
                          {balancePreview.productsDelta > 0.009
                            ? "Cliente paga"
                            : balancePreview.productsDelta < -0.009
                              ? "Restituir"
                              : "Diferença"}
                        </span>
                        <span className="tabular-nums">
                          {formatPrice(Math.abs(balancePreview.productsDelta))}
                        </span>
                      </p>
                    </div>
                  ) : null}
                  <p className="text-[11px] text-stone-500">
                    Retorno por conta da loja. Envio por conta da cliente.
                  </p>
                </div>
              ) : null}
            </div>
          )}

          {contentStep === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-stone-600">
                {kind === "RETURN"
                  ? "Motivo da devolução (obrigatório)."
                  : "Motivo da troca (obrigatório)."}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {EXCHANGE_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => {
                      setReason(r);
                      if (r === "OTHER") setNotes("");
                      else setReasonNotes("");
                    }}
                    className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                      reason === r
                        ? "border-sky-300 bg-sky-100 text-sky-900"
                        : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50"
                    }`}
                  >
                    {EXCHANGE_REASON_LABELS[r]}
                  </button>
                ))}
              </div>
              {reason === "OTHER" && (
                <textarea
                  value={reasonNotes}
                  onChange={(e) => setReasonNotes(e.target.value)}
                  placeholder="Detalhes do motivo…"
                  rows={3}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              )}
              {reason !== "OTHER" && (
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Observações internas (opcional)"
                  rows={2}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              )}
            </div>
          )}

          {contentStep === 4 && (
            <div className="space-y-4">
              {orderIsArranged && arrangedLabel ? (
                <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                  Envio original deste pedido: {arrangedLabel}. O retorno já
                  veio pré-selecionado; você pode alterar.
                </p>
              ) : selectedOrder?.fulfillmentType === "CARRIER" ? (
                <p className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-xs text-stone-600">
                  Envio original: transportadora. O retorno já veio
                  pré-selecionado; você pode alterar.
                </p>
              ) : null}

              <div className="rounded-xl border border-stone-200 p-3">
                <h3 className="mb-2 text-sm font-medium text-stone-900">
                  Como a peça volta
                </h3>
                <MethodToggle
                  value={returnShipping.method}
                  labels={EXCHANGE_RETURN_METHOD_LABELS}
                  order={["CARRIER", "LOCAL_COURIER", "STORE_PICKUP"]}
                  onChange={(method) => {
                    setReturnShipping((s) =>
                      shippingDraftForMethod(
                        method,
                        kind === "EXCHANGE" ? "STORE" : s.paidBy
                      )
                    );
                    setQuoteOptions([]);
                  }}
                />
                <p className="mt-3 text-xs text-stone-500">
                  {returnShipping.method === "CARRIER"
                    ? "Na criação cotamos o retorno (cliente → loja). Se PAC ou SEDEX dos Correios for o mais barato, geramos o código de postagem; senão, realizamos manualmente."
                    : returnShipping.method === "LOCAL_COURIER"
                      ? "Moto boy da loja busca a peça."
                      : "A cliente devolve a peça."}
                </p>
              </div>

              <p className="text-xs text-stone-500">
                {kind === "EXCHANGE"
                  ? "O envio da peça nova e a cobrança da cliente são definidos depois da conferência."
                  : "O valor a restituir é confirmado depois que a peça chegar e for conferida."}
              </p>
            </div>
          )}

          {contentStep === 5 && (
            <div className="space-y-3 text-sm">
              <SummaryRow
                label="Tipo"
                value={kind === "RETURN" ? "Devolução" : "Troca"}
              />
              <SummaryRow
                label="Pedido"
                value={
                  selectedOrder?.orderNumber != null
                    ? `#${selectedOrder.orderNumber}`
                    : "—"
                }
              />
              <SummaryRow
                label="Motivo"
                value={reason ? EXCHANGE_REASON_LABELS[reason] : "—"}
              />
              <div>
                <p className="text-xs font-medium text-stone-500">
                  Peças a devolver
                </p>
                <ul className="mt-1.5 space-y-2">
                  {selectedReturnCards.map((card) => {
                    const selectedUnits = card.units.filter(
                      (unit) => selectedReturnKeys[unit.key]
                    );
                    return (
                      <li
                        key={card.orderItemId}
                        className="rounded-xl border border-stone-200 px-3 py-2.5"
                      >
                        <p className="truncate text-sm font-semibold text-stone-900">
                          {card.identification}
                        </p>
                        <ul className="mt-1 space-y-0.5">
                          {selectedUnits.map((unit) => (
                            <li
                              key={unit.key}
                              className="truncate text-xs text-stone-600"
                            >
                              {unit.pieceLabel}
                            </li>
                          ))}
                        </ul>
                      </li>
                    );
                  })}
                </ul>
              </div>
              <SummaryRow
                label="Frete de retorno"
                value={
                  kind === "EXCHANGE"
                    ? `${EXCHANGE_RETURN_METHOD_LABELS[returnShipping.method]} · loja`
                    : EXCHANGE_RETURN_METHOD_LABELS[returnShipping.method]
                }
              />
              {returnShipping.method === "CARRIER" ? (
                <p className="text-xs text-stone-500">
                  Se Correios (PAC/SEDEX) for o mais barato no sentido cliente →
                  loja, geramos a reversa; senão, realizamos manualmente.
                </p>
              ) : null}
              {kind === "RETURN" ? (
                <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
                  <p className="text-xs font-medium text-stone-500">
                    Valor a restituir
                  </p>
                  <p className="mt-0.5 text-base font-semibold text-stone-900">
                    {refundReady ? formatPrice(refundAmount) : "Informe o valor"}
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <div className="mt-auto flex shrink-0 items-center justify-between gap-2 border-t border-stone-100 px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
          <button
            type="button"
            disabled={step === 0 || submitting}
            onClick={goBack}
            className="rounded-lg px-3 py-2 text-sm font-medium text-stone-600 hover:bg-stone-100 disabled:opacity-40"
          >
            Voltar
          </button>
          {step < steps.length - 1 ? (
            <button
              type="button"
              disabled={!canNext()}
              onClick={goNext}
              className="ml-auto rounded-lg bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-900 ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 disabled:opacity-40"
            >
              Continuar
            </button>
          ) : (
            <button
              type="button"
              disabled={submitting || !canNext()}
              onClick={() => void submit()}
              className="ml-auto rounded-lg bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-900 ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 disabled:opacity-40"
            >
              {submitting
                ? "Criando…"
                : kind === "RETURN"
                  ? "Criar devolução"
                  : "Criar troca"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

function MethodToggle({
  value,
  onChange,
  labels = EXCHANGE_SHIPPING_METHOD_LABELS,
  order = ["CARRIER", "LOCAL_COURIER", "STORE_PICKUP"],
}: {
  value: ExchangeShippingMethod;
  onChange: (v: ExchangeShippingMethod) => void;
  labels?: Record<ExchangeShippingMethod, string>;
  order?: readonly ExchangeShippingMethod[];
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {order.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value === key
              ? "border-sky-300 bg-sky-100 text-sky-900"
              : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50"
          }`}
        >
          {labels[key]}
        </button>
      ))}
    </div>
  );
}

function PaidByToggle({
  value,
  onChange,
}: {
  value: "STORE" | "CUSTOMER";
  onChange: (v: "STORE" | "CUSTOMER") => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(
        [
          ["STORE", "Loja paga"],
          ["CUSTOMER", "Cliente paga"],
        ] as const
      ).map(([key, label]) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
            value === key
              ? "border-sky-300 bg-sky-100 text-sky-900"
              : "border-stone-200 bg-white text-stone-600 hover:border-stone-300 hover:bg-stone-50"
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-stone-100 pb-2">
      <span className="text-stone-500">{label}</span>
      <span className="font-medium text-stone-900">{value}</span>
    </div>
  );
}
