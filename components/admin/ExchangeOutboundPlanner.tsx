"use client";

import { useMemo, useState } from "react";
import { formatPrice } from "@/lib/format";
import {
  CustomSaleSetsForm,
  type CustomSaleSetInput,
} from "@/components/admin/CustomSaleSetsForm";
import { AdminModal } from "@/components/admin/AdminModal";
import {
  EXCHANGE_SHIPPING_METHOD_LABELS,
  isLocalExchangeShippingMethod,
} from "@/lib/exchanges/shipping-method";
import { computeExchangeBalance } from "@/lib/exchanges/balance";
import { isSamePieceSwap, productIdentityKey, roundMoney } from "@/lib/exchanges/product-diff";
import type { ExchangeShippingMethod } from "@/app/generated/prisma/client";
import type { NormalizedShippingOption } from "@/lib/shipping/types";

type CatalogProduct = {
  id: string;
  name: string;
  price: number;
  pixPrice?: number | null;
};

type OutboundCatalogDraft = {
  key: string;
  kind: "catalog";
  productId: string;
  productName: string;
  quantity: number;
  unitPrice: number;
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

export type ReturnedPiece = {
  id: string;
  productId?: string | null;
  productName: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
};

type Props = {
  exchangeId: string;
  destinationCep: string | null;
  returnedItems: ReturnedPiece[];
  returnedCredit: number;
  busy: boolean;
  error: string | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
};

export function ExchangeOutboundPlanner({
  exchangeId,
  destinationCep,
  returnedItems,
  returnedCredit,
  busy,
  error: externalError,
  onClose,
  onSaved,
}: Props) {
  const [products, setProducts] = useState<CatalogProduct[] | null>(null);
  const [productQuery, setProductQuery] = useState("");
  const [showCustom, setShowCustom] = useState(false);
  const [outbound, setOutbound] = useState<OutboundDraft[]>([]);
  const [method, setMethod] = useState<ExchangeShippingMethod>("CARRIER");
  const [serviceId, setServiceId] = useState<number | null>(null);
  const [serviceName, setServiceName] = useState<string | null>(null);
  const [quotedPrice, setQuotedPrice] = useState<number | null>(null);
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
  const [adjustmentReason, setAdjustmentReason] = useState("");

  async function ensureProducts() {
    if (products) return products;
    const res = await fetch("/api/products");
    const data: unknown = await res.json();
    const list = Array.isArray(data) ? (data as CatalogProduct[]) : [];
    setProducts(list);
    return list;
  }

  const filtered = useMemo(() => {
    const list = products ?? [];
    const q = productQuery.trim().toLowerCase();
    if (!q) return list.slice(0, 20);
    return list.filter((p) => p.name.toLowerCase().includes(q)).slice(0, 20);
  }, [products, productQuery]);

  const adjustmentAmount = useMemo(() => {
    const n = Number(adjustmentInput.trim().replace(",", "."));
    if (!Number.isFinite(n) || n <= 0 || adjustmentMode === "none") return 0;
    return roundMoney(adjustmentMode === "refund" ? -n : n);
  }, [adjustmentInput, adjustmentMode]);

  const preview = useMemo(() => {
    const newItemsTotal = roundMoney(
      outbound.reduce((acc, line) => acc + line.unitPrice * line.quantity, 0)
    );
    const samePieceSwap = isSamePieceSwap({
      returned: returnedItems.map((item) => ({
        key: productIdentityKey(item.productId ?? null, item.productName),
        quantity: item.quantity,
      })),
      outbound: outbound.map((line) => ({
        key: productIdentityKey(
          line.kind === "catalog" ? line.productId : null,
          line.productName
        ),
        quantity: line.quantity,
      })),
      allReturnItemsFullySelected: true,
    });
    return computeExchangeBalance({
      returnedItemsTotal: returnedCredit,
      newItemsTotal,
      samePieceSwap,
      adjustmentAmount,
      shippings: [
        {
          quotedPrice: method === "CARRIER" ? quotedPrice : 0,
          paidBy: "CUSTOMER",
        },
      ],
    });
  }, [adjustmentAmount, method, outbound, quotedPrice, returnedCredit, returnedItems]);

  async function quote() {
    if (!destinationCep) {
      setError("Pedido sem CEP para cotar o envio.");
      return;
    }
    if (method !== "CARRIER") return;
    setQuoting(true);
    setError(null);
    try {
      const catalogLines = outbound
        .filter((l): l is OutboundCatalogDraft => l.kind === "catalog")
        .map((l) => ({ productId: l.productId, quantity: l.quantity }));
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

  async function save() {
    if (outbound.length === 0) {
      setError("Selecione o produto que será enviado.");
      return;
    }
    if (Math.abs(adjustmentAmount) > 0.009 && !adjustmentReason.trim()) {
      setError("Informe o motivo do ajuste.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
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
                  unitPrice: l.unitPrice,
                  pieces: l.pieces,
                }
              : {
                  kind: "catalog",
                  productId: l.productId,
                  quantity: l.quantity,
                  unitPrice: l.unitPrice,
                }
          ),
          adjustmentAmount,
          adjustmentReason: adjustmentReason.trim() || null,
          shipping: {
            type: "OUTBOUND",
            method,
            shippingServiceId: serviceId,
            shippingServiceName: serviceName,
            quotedPrice,
            paidBy: "CUSTOMER",
          },
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível definir o envio.");
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

  return (
    <AdminModal
      wide
      title="Definir novo envio"
      subtitle="Escolha o que volta para a cliente e o saldo da troca."
      onClose={onClose}
    >
      <section className="mb-4">
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-stone-400">
          Peças devolvidas
        </h4>
        <ul className="space-y-1.5">
          {returnedItems.map((item) => (
            <li
              key={item.id}
              className="flex justify-between rounded-lg border border-stone-100 px-3 py-2 text-xs"
            >
              <span className="truncate">{item.productName}</span>
              <span className="text-stone-500">{formatPrice(item.lineTotal)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-stone-500">
          Crédito disponível · {formatPrice(returnedCredit)}
        </p>
      </section>

      <section className="space-y-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Enviar
        </h4>
        <div className="relative">
          <input
            value={productQuery}
            onChange={(e) => {
              setProductQuery(e.target.value);
              void ensureProducts();
            }}
            onFocus={() => void ensureProducts()}
            placeholder="Buscar produto do catálogo…"
            className="box-border h-8 w-full rounded-lg border border-stone-200 px-2.5 text-xs"
          />
          {productQuery.trim() && (
            <ul className="absolute z-20 mt-1 max-h-40 w-full overflow-y-auto rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
              {filtered.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOutbound((prev) => [
                        ...prev,
                        {
                          key: `${p.id}-${Date.now()}`,
                          kind: "catalog",
                          productId: p.id,
                          productName: p.name,
                          quantity: 1,
                          unitPrice: p.pixPrice ?? p.price,
                        },
                      ]);
                      setProductQuery("");
                    }}
                    className="flex w-full justify-between rounded-md px-2 py-1.5 text-left text-xs hover:bg-stone-50"
                  >
                    <span className="truncate">{p.name}</span>
                    <span>{formatPrice(p.pixPrice ?? p.price)}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        <button
          type="button"
          onClick={() => setShowCustom((v) => !v)}
          className="text-xs font-medium text-stone-700 underline"
        >
          Novo produto
        </button>
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
                })),
              ]);
              setShowCustom(false);
            }}
          />
        )}
        {outbound.length > 0 && (
          <ul className="space-y-1.5">
            {outbound.map((line) => (
              <li
                key={line.key}
                className="flex items-center justify-between gap-2 rounded-lg border border-stone-100 px-2 py-2 text-xs"
              >
                <span className="min-w-0 truncate">{line.productName}</span>
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  value={line.unitPrice}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setOutbound((prev) =>
                      prev.map((x) =>
                        x.key === line.key
                          ? { ...x, unitPrice: Number.isFinite(value) ? value : 0 }
                          : x
                      )
                    );
                  }}
                  className="w-24 rounded border border-stone-200 px-2 py-1"
                />
                <button
                  type="button"
                  onClick={() =>
                    setOutbound((prev) => prev.filter((x) => x.key !== line.key))
                  }
                  className="text-red-600"
                >
                  Remover
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5">
          {(["STORE_PICKUP", "LOCAL_COURIER", "CARRIER"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setMethod(key);
                setQuoteOptions([]);
                if (isLocalExchangeShippingMethod(key)) {
                  setServiceId(null);
                  setServiceName(EXCHANGE_SHIPPING_METHOD_LABELS[key]);
                  setQuotedPrice(0);
                }
              }}
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
            onClick={() => void quote()}
            className="text-xs font-medium text-stone-700 underline"
          >
            {quoting ? "Cotando…" : "Cotar frete de envio"}
          </button>
        )}
        {serviceName && (
          <p className="text-xs text-stone-600">
            {serviceName}
            {quotedPrice != null ? ` · ${formatPrice(quotedPrice)}` : ""}
          </p>
        )}
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
                  className="flex w-full justify-between rounded px-2 py-1 text-left text-xs hover:bg-stone-50"
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
      </section>

      <section className="mt-4 space-y-2 rounded-xl border border-stone-200 p-3">
        <h4 className="text-xs font-semibold uppercase tracking-wide text-stone-400">
          Ajuste de saldo
        </h4>
        <div className="flex flex-wrap gap-1.5">
          {(
            [
              ["none", "Nenhum"],
              ["charge", "Cobrar a mais"],
              ["refund", "Devolver a mais"],
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
          <>
            <input
              value={adjustmentInput}
              onChange={(e) => setAdjustmentInput(e.target.value)}
              placeholder="Valor"
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
            <input
              value={adjustmentReason}
              onChange={(e) => setAdjustmentReason(e.target.value)}
              placeholder="Motivo do ajuste"
              className="w-full rounded-lg border border-stone-200 px-3 py-2 text-sm"
            />
          </>
        ) : null}
        <dl className="space-y-1 text-xs text-stone-600">
          <div className="flex justify-between">
            <dt>Produtos novos</dt>
            <dd>{formatPrice(preview.newItemsTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Crédito devolvido</dt>
            <dd>- {formatPrice(preview.returnedItemsTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt>Frete de envio</dt>
            <dd>{formatPrice(preview.shippingCustomerTotal)}</dd>
          </div>
          {Math.abs(adjustmentAmount) > 0.009 ? (
            <div className="flex justify-between">
              <dt>Ajuste</dt>
              <dd>
                {adjustmentAmount > 0 ? "+" : "-"}{" "}
                {formatPrice(Math.abs(adjustmentAmount))}
              </dd>
            </div>
          ) : null}
          <div className="flex justify-between font-semibold text-stone-900">
            <dt>Saldo</dt>
            <dd>
              {preview.balanceAmount > 0.009
                ? `Cliente deve ${formatPrice(preview.balanceAmount)}`
                : preview.balanceAmount < -0.009
                  ? `Restituir ${formatPrice(Math.abs(preview.balanceAmount))}`
                  : formatPrice(0)}
            </dd>
          </div>
        </dl>
      </section>

      {shownError && <p className="mt-3 text-xs text-red-600">{shownError}</p>}
      <div className="mt-4 flex justify-end gap-2">
        <button
          type="button"
          onClick={onClose}
          className="rounded-lg px-3 py-2 text-sm text-stone-600 hover:bg-stone-100"
        >
          Cancelar
        </button>
        <button
          type="button"
          disabled={busy || saving || outbound.length === 0}
          onClick={() => void save()}
          className="rounded-lg bg-sky-100 px-4 py-2 text-sm font-semibold text-sky-900 ring-1 ring-sky-200 disabled:opacity-40"
        >
          {saving ? "Salvando…" : "Confirmar envio e saldo"}
        </button>
      </div>
    </AdminModal>
  );
}
