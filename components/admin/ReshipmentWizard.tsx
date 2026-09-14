"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { CUSTOM_SET_SIZES } from "@/components/admin/CustomSaleSetsForm";
import { formatPrice } from "@/lib/format";
import { formatDeliveryDaysLabel } from "@/lib/shipping/delivery-days-label";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import type { ExchangeShippingMethod } from "@/app/generated/prisma/client";
import { EXCHANGE_SHIPPING_METHOD_LABELS } from "@/lib/exchanges/shipping-method";
import {
  formatPieceLabel,
  type ReturnCard,
  type ReturnUnit,
} from "@/lib/exchanges/return-units";
import type { CartPieceSelection } from "@/lib/cart/types";
import { groupSelectedReshipUnits } from "@/lib/reshipments/availability";
import type { Product, ProductPiece } from "@/lib/types";

type Props = {
  orderId: string;
  orderLabel: string;
  products?: Product[];
  onClose: () => void;
  onCreated: () => void;
};

type PieceOverride = { color: string | null; size: string | null };

function catalogPieceForUnit(
  products: Product[],
  unit: ReturnUnit
): ProductPiece | null {
  if (!unit.productId) return null;
  const product = products.find((row) => row.id === unit.productId);
  if (!product?.pieces?.length) return null;
  const pieceName = unit.pieceSelection?.pieceName?.trim();
  if (pieceName) {
    const named = product.pieces.find((piece) => piece.name === pieceName);
    if (named) return named;
  }
  return product.pieces.length === 1 ? product.pieces[0]! : null;
}

function shippedPiece(
  unit: ReturnUnit,
  override: PieceOverride | undefined
): CartPieceSelection | null {
  const base = unit.pieceSelection;
  if (!base && !override) return null;
  return {
    pieceName: base?.pieceName ?? unit.identification,
    color: override ? override.color : base?.color ?? null,
    size: override ? override.size : base?.size ?? null,
  };
}

export function ReshipmentWizard({
  orderId,
  orderLabel,
  products = [],
  onClose,
  onCreated,
}: Props) {
  const [catalogProducts, setCatalogProducts] = useState<Product[]>(products);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<ReturnCard[]>([]);
  const [unavailableKeys, setUnavailableKeys] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [overrides, setOverrides] = useState<Record<string, PieceOverride>>({});
  const [method, setMethod] = useState<ExchangeShippingMethod>("CARRIER");
  const [destinationCep, setDestinationCep] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [options, setOptions] = useState<NormalizedShippingOption[]>([]);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setCatalogProducts(products);
  }, [products]);

  useEffect(() => {
    if (products.length > 0) return;
    void (async () => {
      try {
        const res = await fetch("/api/products");
        const data = (await res.json()) as unknown;
        if (Array.isArray(data)) setCatalogProducts(data as Product[]);
      } catch {
        /* opções de catálogo são opcionais */
      }
    })();
  }, [products.length]);

  useEffect(() => {
    void (async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/admin/orders/${orderId}/reshipments`);
        const data = (await res.json()) as {
          error?: string;
          cards?: ReturnCard[];
          unavailableKeys?: string[];
          defaultMethod?: ExchangeShippingMethod;
          destinationCep?: string | null;
        };
        if (!res.ok) {
          setError(data.error ?? "Não foi possível carregar as peças.");
          return;
        }
        setCards(data.cards ?? []);
        setUnavailableKeys(new Set(data.unavailableKeys ?? []));
        if (data.defaultMethod) setMethod(data.defaultMethod);
        setDestinationCep(data.destinationCep ?? null);
      } catch {
        setError("Erro de conexão.");
      } finally {
        setLoading(false);
      }
    })();
  }, [orderId]);

  const shippedByUnitKey = useMemo(() => {
    const map: Record<string, CartPieceSelection | null> = {};
    for (const card of cards) {
      for (const unit of card.units) {
        map[unit.key] = shippedPiece(unit, overrides[unit.key]);
      }
    }
    return map;
  }, [cards, overrides]);

  const selectedItems = useMemo(
    () => groupSelectedReshipUnits(cards, selected, shippedByUnitKey),
    [cards, selected, shippedByUnitKey]
  );

  function toggleUnit(key: string, disabled: boolean) {
    if (disabled) return;
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function patchOverride(unit: ReturnUnit, patch: Partial<PieceOverride>) {
    setOverrides((current) => {
      const shipped = shippedPiece(unit, current[unit.key]);
      return {
        ...current,
        [unit.key]: {
          color: patch.color !== undefined ? patch.color : shipped?.color ?? null,
          size: patch.size !== undefined ? patch.size : shipped?.size ?? null,
        },
      };
    });
  }

  async function quoteCarrier() {
    if (!destinationCep) {
      setError("O pedido precisa de CEP para cotar a transportadora.");
      return;
    }
    if (selectedItems.length === 0) {
      setError("Selecione as peças esquecidas.");
      return;
    }
    setQuoting(true);
    setError(null);
    try {
      const lines = cards.flatMap((card) => {
        const qty = card.units.filter((unit) => selected.has(unit.key)).length;
        if (qty === 0 || !card.productId) return [];
        return [{ productId: card.productId, quantity: qty }];
      });
      const res = await fetch("/api/admin/reshipments/quote", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destinationCep,
          lines:
            lines.length > 0
              ? lines
              : [{ productId: "", quantity: selectedItems.reduce((s, i) => s + i.quantity, 0) }],
        }),
      });
      const data = (await res.json()) as {
        error?: string;
        options?: NormalizedShippingOption[];
      };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível cotar o frete.");
        return;
      }
      setOptions(data.options ?? []);
      setOptionId(data.options?.[0]?.id ?? null);
    } catch {
      setError("Erro de conexão ao cotar o frete.");
    } finally {
      setQuoting(false);
    }
  }

  async function submit() {
    if (selectedItems.length === 0) {
      setError("Selecione ao menos uma peça.");
      return;
    }
    const option = options.find((row) => row.id === optionId) ?? null;
    if (method === "CARRIER" && !option) {
      setError("Cote e selecione o serviço de frete.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderId}/reshipments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          method,
          notes,
          items: selectedItems,
          shippingServiceId: option?.serviceId ?? null,
          shippingServiceName: option
            ? `${option.carrierName} ${option.serviceName}`.trim()
            : null,
          quotedPrice: option?.price ?? null,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível criar o reenvio.");
        return;
      }
      onCreated();
    } catch {
      setError("Erro de conexão.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <AdminModal
      title="Criar reenvio"
      subtitle={`${orderLabel} · sem nova venda e sem novo estoque`}
      onClose={onClose}
      footer={
        <>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-600 hover:bg-stone-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void submit()}
            className="rounded-lg bg-stone-900 px-3 py-2 text-sm font-medium text-white hover:bg-stone-800 disabled:opacity-50"
          >
            {saving ? "Criando…" : "Criar reenvio"}
          </button>
        </>
      }
    >
      {loading ? (
        <p className="text-sm text-stone-500">Carregando peças…</p>
      ) : (
        <div className="space-y-5">
          <p className="text-xs text-stone-500">
            Use quando uma peça paga ficou de fora do pacote. Cor e tamanho podem ser
            alterados no reenvio.
          </p>
          <div className="space-y-3">
            {cards.map((card) => (
              <div key={card.orderItemId} className="rounded-lg border border-stone-200 p-3">
                <p className="text-sm font-medium text-stone-900">{card.identification}</p>
                <ul className="mt-2 space-y-2">
                  {card.units.map((unit) => {
                    const blocked = unavailableKeys.has(unit.key);
                    const checked = selected.has(unit.key);
                    const shipped = shippedPiece(unit, overrides[unit.key]);
                    const pieceOptions = catalogPieceForUnit(catalogProducts, unit);
                    const colorOptions = pieceOptions?.colors.map((color) => color.name) ?? [];
                    const sizeOptions = pieceOptions?.sizes.map((size) => size.name) ?? [];
                    const customSizes =
                      shipped?.size &&
                      !(CUSTOM_SET_SIZES as readonly string[]).includes(shipped.size) &&
                      !sizeOptions.includes(shipped.size)
                        ? [...CUSTOM_SET_SIZES, shipped.size]
                        : [...CUSTOM_SET_SIZES];
                    return (
                      <li key={unit.key} className="rounded-md bg-stone-50 px-2 py-2">
                        <label
                          className={`flex items-center gap-2 text-sm ${
                            blocked ? "cursor-not-allowed text-stone-400" : "text-stone-700"
                          }`}
                        >
                          <input
                            type="checkbox"
                            disabled={blocked}
                            checked={checked}
                            onChange={() => toggleUnit(unit.key, blocked)}
                            className="h-4 w-4 rounded border-stone-300 accent-stone-900 disabled:opacity-40"
                          />
                          <span>
                            {shipped ? formatPieceLabel(shipped) : unit.pieceLabel}
                          </span>
                          {blocked ? (
                            <span className="text-xs">já em reenvio ativo</span>
                          ) : null}
                        </label>
                        {checked && !blocked ? (
                          <div className="mt-2 space-y-2 pl-6">
                            {colorOptions.length > 0 ? (
                              <div>
                                <p className="mb-1 text-[11px] font-medium text-stone-500">Cor</p>
                                <div className="flex flex-wrap gap-1">
                                  {colorOptions.map((color) => (
                                    <button
                                      key={color}
                                      type="button"
                                      onClick={() => patchOverride(unit, { color })}
                                      className={`rounded-md px-2 py-1 text-xs font-medium ${
                                        shipped?.color === color
                                          ? "bg-stone-900 text-white"
                                          : "bg-white text-stone-600 ring-1 ring-stone-200"
                                      }`}
                                    >
                                      {color}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            ) : (
                              <label className="block text-[11px] font-medium text-stone-500">
                                Cor
                                <input
                                  value={shipped?.color ?? ""}
                                  onChange={(e) =>
                                    patchOverride(unit, {
                                      color: e.target.value.trim() || null,
                                    })
                                  }
                                  className="mt-1 w-full rounded-md border border-stone-200 bg-white px-2 py-1.5 text-sm text-stone-800"
                                />
                              </label>
                            )}
                            <div>
                              <p className="mb-1 text-[11px] font-medium text-stone-500">
                                Tamanho
                              </p>
                              <div className="flex flex-wrap gap-1">
                                {(sizeOptions.length > 0 ? sizeOptions : customSizes).map(
                                  (size) => (
                                    <button
                                      key={size}
                                      type="button"
                                      onClick={() =>
                                        patchOverride(unit, {
                                          size: shipped?.size === size ? null : size,
                                        })
                                      }
                                      className={`min-w-[2.25rem] rounded-md px-2 py-1 text-xs font-semibold ${
                                        shipped?.size === size
                                          ? "bg-stone-900 text-white"
                                          : "bg-white text-stone-600 ring-1 ring-stone-200"
                                      }`}
                                    >
                                      {size}
                                    </button>
                                  )
                                )}
                              </div>
                            </div>
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            {cards.length === 0 ? (
              <p className="text-sm text-stone-500">Este pedido não tem peças.</p>
            ) : null}
          </div>

          <div>
            <p className="mb-2 text-xs font-medium text-stone-500">Como enviar</p>
            <div className="grid gap-2">
              {(["CARRIER", "LOCAL_COURIER", "STORE_PICKUP"] as const).map((value) => (
                <label
                  key={value}
                  className="flex items-center gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm text-stone-700"
                >
                  <input
                    type="radio"
                    name="reship-method"
                    checked={method === value}
                    onChange={() => setMethod(value)}
                    className="accent-stone-900"
                  />
                  {EXCHANGE_SHIPPING_METHOD_LABELS[value]}
                </label>
              ))}
            </div>
          </div>

          {method === "CARRIER" ? (
            <div className="space-y-2">
              <button
                type="button"
                disabled={quoting}
                onClick={() => void quoteCarrier()}
                className="rounded-lg border border-stone-200 px-3 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                {quoting ? "Cotando…" : "Cotar transportadora"}
              </button>
              {options.length > 0 ? (
                <ul className="space-y-1.5">
                  {options.map((option) => (
                    <li key={option.id}>
                      <label className="flex items-center justify-between gap-2 rounded-lg border border-stone-200 px-3 py-2 text-sm">
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name="reship-option"
                            checked={optionId === option.id}
                            onChange={() => setOptionId(option.id)}
                            className="accent-stone-900"
                          />
                          {option.carrierName} · {option.serviceName}
                        </span>
                        <span className="shrink-0 text-stone-600">
                          {formatPrice(option.price)} ·{" "}
                          {formatDeliveryDaysLabel(
                            option.deliveryDaysMin,
                            option.deliveryDaysMax
                          )}
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <label className="block text-sm text-stone-700">
            Observações internas
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-1 w-full rounded-lg border border-stone-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-stone-200"
              placeholder="Ex.: esquecemos o cinto no pacote original"
            />
          </label>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}
        </div>
      )}
    </AdminModal>
  );
}
