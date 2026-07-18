"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import {
  EXCHANGE_REASON_LABELS,
  EXCHANGE_REASONS,
} from "@/lib/exchanges/constants";
import { computeExchangeBalance } from "@/lib/exchanges/balance";
import {
  defaultExchangeShippingMethodForOrder,
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

type Props = {
  open: boolean;
  onClose: () => void;
  onCreated: (exchangeId: string) => void;
};

type WizardKind = "EXCHANGE" | "RETURN";

const STEPS_EXCHANGE = [
  "Pedido",
  "Devolver",
  "Enviar",
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
  const [returnQty, setReturnQty] = useState<Record<string, number>>({});
  const [outbound, setOutbound] = useState<OutboundDraft[]>([]);
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [productQuery, setProductQuery] = useState("");
  const [showCustomSets, setShowCustomSets] = useState(false);
  const [reason, setReason] = useState<ExchangeReason>("SIZE");
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
  const [generateReverseOnCreate, setGenerateReverseOnCreate] = useState(true);

  const reset = useCallback(() => {
    setKind("EXCHANGE");
    setStep(0);
    setOrderQuery("");
    setSelectedOrder(null);
    setReturnQty({});
    setOutbound([]);
    setProductQuery("");
    setShowCustomSets(false);
    setReason("SIZE");
    setReasonNotes("");
    setNotes("");
    setReturnShipping(shippingDraftForMethod("CARRIER"));
    setOutboundShipping(shippingDraftForMethod("CARRIER"));
    setQuoteOptions([]);
    setError(null);
    setGenerateReverseOnCreate(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    reset();
    setOrdersLoading(true);
    void (async () => {
      try {
        const res = await fetch("/api/admin/orders?status=paid");
        const data = (await res.json()) as { orders?: PaidOrder[] };
        setOrders(Array.isArray(data.orders) ? data.orders : []);
      } catch {
        setOrders([]);
      } finally {
        setOrdersLoading(false);
      }
    })();
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

  const filteredOrders = useMemo(() => {
    const q = orderQuery.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const num = o.orderNumber != null ? `#${o.orderNumber}` : o.id;
      const hay = [
        num,
        o.recipientName ?? "",
        o.email ?? "",
        o.id,
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [orders, orderQuery]);

  const returnLines = useMemo(() => {
    if (!selectedOrder) return [];
    return selectedOrder.items
      .filter((item) => (returnQty[item.id] ?? 0) > 0)
      .map((item) => ({
        orderItemId: item.id,
        quantity: returnQty[item.id] ?? 0,
        productName: item.productName,
        unitPrice: item.price,
        lineTotal: item.price * (returnQty[item.id] ?? 0),
        productId: item.productId,
      }));
  }, [selectedOrder, returnQty]);

  const returnedItemsTotal = returnLines.reduce((a, l) => a + l.lineTotal, 0);
  const newItemsTotal = outbound.reduce(
    (a, l) => a + l.unitPrice * l.quantity,
    0
  );

  const balancePreview = useMemo(
    () =>
      computeExchangeBalance({
        returnedItemsTotal,
        newItemsTotal,
        shippings: [
          {
            quotedPrice: returnShipping.quotedPrice,
            paidBy: returnShipping.paidBy,
          },
          ...(outbound.length > 0
            ? [
                {
                  quotedPrice: outboundShipping.quotedPrice,
                  paidBy: outboundShipping.paidBy,
                },
              ]
            : []),
        ],
      }),
    [
      returnedItemsTotal,
      newItemsTotal,
      returnShipping,
      outboundShipping,
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

  function applyOrderShippingDefaults(order: PaidOrder) {
    const method = defaultExchangeShippingMethodForOrder(order);
    setReturnShipping(shippingDraftForMethod(method));
    setOutboundShipping(shippingDraftForMethod(method));
    setGenerateReverseOnCreate(method === "CARRIER");
    setQuoteOptions([]);
  }

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
              ? returnShipping.paidBy
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

  /** Índice lógico nos steps de troca (com Enviar). */
  function logicalStep(uiStep: number): number {
    if (kind === "EXCHANGE") return uiStep;
    // RETURN: 0 Pedido, 1 Devolver, 2 Motivo(=3), 3 Frete(=4), 4 Confirmar(=5)
    if (uiStep <= 1) return uiStep;
    return uiStep + 1;
  }

  function canNext(): boolean {
    const s = logicalStep(step);
    if (s === 0) return !!selectedOrder;
    if (s === 1) return returnLines.length > 0;
    if (s === 3) return !!reason && (reason !== "OTHER" || !!reasonNotes.trim());
    return true;
  }

  function goNext() {
    setStep((s) => Math.min(steps.length - 1, s + 1));
  }

  function goBack() {
    setStep((s) => Math.max(0, s - 1));
  }

  async function submit() {
    if (!selectedOrder) return;
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
          paidBy: returnShipping.paidBy,
          packageHeightCm: returnShipping.packageHeightCm,
          packageWidthCm: returnShipping.packageWidthCm,
          packageLengthCm: returnShipping.packageLengthCm,
          packageWeightKg: returnShipping.packageWeightKg,
        },
      ];
      if (kind === "EXCHANGE" && outbound.length > 0) {
        shippings.push({
          type: "OUTBOUND",
          method: outboundShipping.method,
          shippingServiceId: outboundShipping.serviceId,
          shippingServiceName: outboundShipping.serviceName,
          quotedPrice: outboundShipping.quotedPrice,
          paidBy: outboundShipping.paidBy,
          packageHeightCm: outboundShipping.packageHeightCm,
          packageWidthCm: outboundShipping.packageWidthCm,
          packageLengthCm: outboundShipping.packageLengthCm,
          packageWeightKg: outboundShipping.packageWeightKg,
        });
      }

      const res = await fetch("/api/admin/exchanges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          orderId: selectedOrder.id,
          kind,
          reason,
          reasonNotes: reasonNotes.trim() || null,
          notes: notes.trim() || null,
          returnLines: returnLines.map((l) => ({
            orderItemId: l.orderItemId,
            quantity: l.quantity,
          })),
          outboundLines:
            kind === "RETURN"
              ? []
              : outbound.map((l) =>
                  l.kind === "custom"
                    ? {
                        kind: "custom" as const,
                        description: l.productName,
                        quantity: l.quantity,
                        unitPrice: l.unitPrice,
                        pieces: l.pieces,
                      }
                    : {
                        kind: "catalog" as const,
                        productId: l.productId,
                        quantity: l.quantity,
                        unitPrice: l.unitPrice,
                        pieceSelections: l.pieceSelections,
                      }
                ),
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

      if (
        generateReverseOnCreate &&
        returnShipping.method === "CARRIER" &&
        returnShipping.serviceId
      ) {
        await fetch(`/api/admin/exchanges/${data.exchange.id}/labels`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "RETURN",
            serviceId: returnShipping.serviceId,
          }),
        });
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

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {error && (
            <div className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {contentStep === 0 && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-1.5">
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
                      setStep(0);
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
              {kind === "RETURN" && (
                <p className="text-xs text-stone-500">
                  Devolução: etiqueta reversa e reembolso do valor dos itens —
                  sem enviar produto novo.
                </p>
              )}
              <input
                value={orderQuery}
                onChange={(e) => setOrderQuery(e.target.value)}
                placeholder="Buscar por nº, cliente ou e-mail…"
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
              {ordersLoading ? (
                <p className="text-sm text-stone-500">Carregando pedidos…</p>
              ) : (
                <ul className="divide-y divide-stone-100 rounded-xl border border-stone-200">
                  {filteredOrders.slice(0, 40).map((o) => {
                    const selected = selectedOrder?.id === o.id;
                    const shipHint =
                      o.fulfillmentType === "ARRANGED"
                        ? resolveArrangedDeliveryDisplay({
                            shippingServiceName: o.shippingServiceName,
                            deliveryNotes: o.deliveryNotes,
                            shippingAmount: o.shippingAmount ?? 0,
                          }).typeLabel
                        : "Transportadora";
                    return (
                      <li key={o.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedOrder(o);
                            setReturnQty({});
                            setOutbound([]);
                            applyOrderShippingDefaults(o);
                          }}
                          className={`flex w-full items-start justify-between gap-3 px-3 py-3 text-left text-sm ${
                            selected ? "bg-stone-100" : "hover:bg-stone-50"
                          }`}
                        >
                          <span>
                            <span className="font-medium text-stone-900">
                              {o.orderNumber != null
                                ? `#${o.orderNumber}`
                                : o.id.slice(0, 8)}
                            </span>
                            <span className="mt-0.5 block text-xs text-stone-500">
                              {o.recipientName || o.email || "Sem nome"} ·{" "}
                              {o.items.length} item(ns) · {shipHint}
                            </span>
                          </span>
                          <span className="shrink-0 text-xs text-stone-600">
                            {formatPrice(o.total)}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {contentStep === 1 && selectedOrder && (
            <div className="space-y-3">
              <p className="text-sm text-stone-600">
                Selecione o que a cliente vai devolver.
              </p>
              <ul className="space-y-2">
                {selectedOrder.items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-center justify-between gap-3 rounded-xl border border-stone-200 px-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-stone-900">
                        {item.productName}
                      </p>
                      <p className="text-xs text-stone-500">
                        {formatPrice(item.price)} · até {item.quantity} un.
                      </p>
                    </div>
                    <input
                      type="number"
                      min={0}
                      max={item.quantity}
                      value={returnQty[item.id] ?? 0}
                      onChange={(e) =>
                        setReturnQty((prev) => ({
                          ...prev,
                          [item.id]: Math.min(
                            item.quantity,
                            Math.max(0, Math.floor(Number(e.target.value) || 0))
                          ),
                        }))
                      }
                      className="w-16 rounded-lg border border-stone-200 px-2 py-1.5 text-center text-sm"
                    />
                  </li>
                ))}
              </ul>
            </div>
          )}

          {contentStep === 2 && (
            <div className="space-y-5">
              <div>
                <h3 className="text-sm font-semibold text-stone-900">
                  Itens de saída
                </h3>
                <p className="mt-0.5 text-xs text-stone-500">
                  Opcional: selecione do catálogo ou descreva um produto sem
                  cadastrar, como na venda avulsa.
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
                    Nenhum item de saída ainda.
                  </p>
                  <p className="mt-1 text-xs text-stone-400">
                    Pode seguir sem reenvio se for só devolução.
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
            </div>
          )}

          {contentStep === 3 && (
            <div className="space-y-3">
              <p className="text-sm text-stone-600">Motivo da troca (obrigatório).</p>
              <div className="flex flex-wrap gap-1.5">
                {EXCHANGE_REASONS.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setReason(r)}
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
              {(reason === "OTHER" || reason === "DEFECT") && (
                <textarea
                  value={reasonNotes}
                  onChange={(e) => setReasonNotes(e.target.value)}
                  placeholder="Detalhes do motivo…"
                  rows={3}
                  className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
                />
              )}
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Observações internas (opcional)"
                rows={2}
                className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
              />
            </div>
          )}

          {contentStep === 4 && (
            <div className="space-y-4">
              {orderIsArranged && (
                <p className="rounded-lg border border-sky-200 bg-sky-50 px-3 py-2 text-xs text-sky-900">
                  Pedido original: {arrangedLabel}. Sugerimos retorno local —
                  sem etiqueta SuperFrete.
                </p>
              )}

              <div className="rounded-xl border border-stone-200 p-3">
                <h3 className="mb-2 text-sm font-medium text-stone-900">
                  Como a peça volta
                </h3>
                <MethodToggle
                  value={returnShipping.method}
                  onChange={(method) => {
                    setReturnShipping((s) =>
                      shippingDraftForMethod(method, s.paidBy)
                    );
                    setGenerateReverseOnCreate(method === "CARRIER");
                    setQuoteOptions([]);
                  }}
                />
                {returnShipping.method === "CARRIER" ? (
                  <>
                    <div className="mt-3 flex items-center justify-between">
                      <PaidByToggle
                        value={returnShipping.paidBy}
                        onChange={(paidBy) =>
                          setReturnShipping((s) => ({ ...s, paidBy }))
                        }
                      />
                      <button
                        type="button"
                        disabled={quoting}
                        onClick={() =>
                          void quoteFor(
                            "RETURN",
                            returnLines
                              .filter((l) => l.productId)
                              .map((l) => ({
                                productId: l.productId!,
                                quantity: l.quantity,
                              }))
                          )
                        }
                        className="text-xs font-medium text-stone-700 underline"
                      >
                        {quoting ? "Cotando…" : "Cotar SuperFrete"}
                      </button>
                    </div>
                    {returnShipping.serviceName && (
                      <p className="mt-2 text-xs text-stone-600">
                        {returnShipping.serviceName} ·{" "}
                        {formatPrice(returnShipping.quotedPrice ?? 0)}
                      </p>
                    )}
                    <label className="mt-3 flex items-center gap-2 text-xs text-stone-600">
                      <input
                        type="checkbox"
                        checked={generateReverseOnCreate}
                        onChange={(e) =>
                          setGenerateReverseOnCreate(e.target.checked)
                        }
                      />
                      Gerar etiqueta reversa ao criar
                    </label>
                  </>
                ) : (
                  <p className="mt-3 text-xs text-stone-500">
                    {returnShipping.method === "STORE_PICKUP"
                      ? "Cliente traz na loja. Depois use “Recebi e conferir”."
                      : "Coleta combinada (Uber/motoboy). Sem rastreio SuperFrete."}
                  </p>
                )}
              </div>

              {outbound.length > 0 && (
                <div className="rounded-xl border border-stone-200 p-3">
                  <h3 className="mb-2 text-sm font-medium text-stone-900">
                    Como a peça nova sai
                  </h3>
                  <MethodToggle
                    value={outboundShipping.method}
                    onChange={(method) => {
                      setOutboundShipping((s) =>
                        shippingDraftForMethod(method, s.paidBy)
                      );
                      setQuoteOptions([]);
                    }}
                  />
                  {outboundShipping.method === "CARRIER" ? (
                    <>
                      <div className="mt-3 flex items-center justify-between">
                        <PaidByToggle
                          value={outboundShipping.paidBy}
                          onChange={(paidBy) =>
                            setOutboundShipping((s) => ({ ...s, paidBy }))
                          }
                        />
                        <button
                          type="button"
                          disabled={quoting}
                          onClick={() => {
                            const catalogLines = outbound
                              .filter(
                                (l): l is OutboundCatalogDraft =>
                                  l.kind === "catalog"
                              )
                              .map((l) => ({
                                productId: l.productId,
                                quantity: l.quantity,
                              }));
                            void quoteFor(
                              "OUTBOUND",
                              catalogLines.length > 0
                                ? catalogLines
                                : [{ productId: "", quantity: 1 }]
                            );
                          }}
                          className="text-xs font-medium text-stone-700 underline"
                        >
                          {quoting ? "Cotando…" : "Cotar SuperFrete"}
                        </button>
                      </div>
                      {outboundShipping.serviceName && (
                        <p className="mt-2 text-xs text-stone-600">
                          {outboundShipping.serviceName} ·{" "}
                          {formatPrice(outboundShipping.quotedPrice ?? 0)}
                        </p>
                      )}
                    </>
                  ) : (
                    <p className="mt-3 text-xs text-stone-500">
                      {outboundShipping.method === "STORE_PICKUP"
                        ? "Cliente retira a peça nova na loja."
                        : "Entrega local (Uber/motoboy) da peça nova."}
                    </p>
                  )}
                </div>
              )}

              {quoteOptions.length > 0 &&
                returnShipping.method === "CARRIER" && (
                  <ul className="space-y-1 rounded-xl border border-stone-100 p-2">
                    {quoteOptions.map((opt) => (
                      <li key={opt.id}>
                        <button
                          type="button"
                          onClick={() => {
                            const draft = {
                              method: "CARRIER" as const,
                              serviceId: opt.serviceId,
                              serviceName: `${opt.carrierName} — ${opt.serviceName}`,
                              quotedPrice: opt.price,
                            };
                            if (
                              outbound.length > 0 &&
                              outboundShipping.method === "CARRIER" &&
                              returnShipping.serviceId != null
                            ) {
                              setOutboundShipping((s) => ({
                                ...s,
                                ...draft,
                              }));
                            } else {
                              setReturnShipping((s) => ({
                                ...s,
                                ...draft,
                              }));
                            }
                          }}
                          className="flex w-full justify-between rounded-lg px-2 py-1.5 text-left text-xs hover:bg-stone-50"
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
                value={EXCHANGE_REASON_LABELS[reason]}
              />
              <SummaryRow
                label="Itens devolvidos"
                value={`${returnLines.length} · ${formatPrice(returnedItemsTotal)}`}
              />
              {kind === "EXCHANGE" && (
                <SummaryRow
                  label="Itens novos"
                  value={`${outbound.length} · ${formatPrice(newItemsTotal)}`}
                />
              )}
              <SummaryRow
                label="Diferença produtos"
                value={formatPrice(balancePreview.productsDelta)}
              />
              <SummaryRow
                label="Retorno"
                value={EXCHANGE_SHIPPING_METHOD_LABELS[returnShipping.method]}
              />
              {kind === "EXCHANGE" && outbound.length > 0 && (
                <SummaryRow
                  label="Reenvio"
                  value={
                    EXCHANGE_SHIPPING_METHOD_LABELS[outboundShipping.method]
                  }
                />
              )}
              <SummaryRow
                label="Frete (cliente)"
                value={formatPrice(balancePreview.shippingCustomerTotal)}
              />
              <div className="rounded-xl border border-stone-200 bg-stone-50 px-3 py-3">
                <p className="text-xs font-medium text-stone-500">
                  {kind === "RETURN" ? "Valor a reembolsar" : "Saldo da troca"}
                </p>
                <p className="mt-0.5 text-base font-semibold text-stone-900">
                  {balancePreview.balanceAmount > 0.009
                    ? `Cliente deve ${formatPrice(balancePreview.balanceAmount)}`
                    : balancePreview.balanceAmount < -0.009
                      ? `Crédito ${formatPrice(Math.abs(balancePreview.balanceAmount))}`
                      : "Sem diferença"}
                </p>
              </div>
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
}: {
  value: ExchangeShippingMethod;
  onChange: (v: ExchangeShippingMethod) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(
        [
          "STORE_PICKUP",
          "LOCAL_COURIER",
          "CARRIER",
        ] as const satisfies readonly ExchangeShippingMethod[]
      ).map((key) => (
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
          {EXCHANGE_SHIPPING_METHOD_LABELS[key]}
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
