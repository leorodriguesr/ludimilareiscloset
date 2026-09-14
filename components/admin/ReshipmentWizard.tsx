"use client";

import { useEffect, useMemo, useState } from "react";
import { AdminModal } from "@/components/admin/AdminModal";
import { formatPrice } from "@/lib/format";
import { formatDeliveryDaysLabel } from "@/lib/shipping/delivery-days-label";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import type { ExchangeShippingMethod } from "@/app/generated/prisma/client";
import { EXCHANGE_SHIPPING_METHOD_LABELS } from "@/lib/exchanges/shipping-method";
import type { ReturnCard } from "@/lib/exchanges/return-units";
import { groupSelectedReshipUnits } from "@/lib/reshipments/availability";

type Props = {
  orderId: string;
  orderLabel: string;
  onClose: () => void;
  onCreated: () => void;
};

export function ReshipmentWizard({ orderId, orderLabel, onClose, onCreated }: Props) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [cards, setCards] = useState<ReturnCard[]>([]);
  const [unavailableKeys, setUnavailableKeys] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [method, setMethod] = useState<ExchangeShippingMethod>("CARRIER");
  const [destinationCep, setDestinationCep] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [quoting, setQuoting] = useState(false);
  const [options, setOptions] = useState<NormalizedShippingOption[]>([]);
  const [optionId, setOptionId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

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

  const selectedItems = useMemo(
    () => groupSelectedReshipUnits(cards, selected),
    [cards, selected]
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
            Use quando uma peça paga ficou de fora do pacote. O reenvio entra em Envios e o
            frete (pago pela loja) conta no custo operacional — não nas vendas.
          </p>
          <div className="space-y-3">
            {cards.map((card) => (
              <div key={card.orderItemId} className="rounded-lg border border-stone-200 p-3">
                <p className="text-sm font-medium text-stone-900">{card.identification}</p>
                <ul className="mt-2 space-y-1.5">
                  {card.units.map((unit) => {
                    const blocked = unavailableKeys.has(unit.key);
                    const checked = selected.has(unit.key);
                    return (
                      <li key={unit.key}>
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
                          <span>{unit.pieceLabel}</span>
                          {blocked ? (
                            <span className="text-xs">já em reenvio ativo</span>
                          ) : null}
                        </label>
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
