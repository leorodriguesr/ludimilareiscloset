"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import { invalidateSettingsCache } from "@/lib/hooks/use-store-settings";

interface StoreSettings {
  bannerImageUrl: string;
  bannerMobileImageUrl: string;
  freeShippingEnabled: boolean;
  freeShippingType: string;
  freeShippingMinValue: number;
  packagingDays: number;
  storeDeliveryFee: number;
}

export function StoreSettingsManager() {
  const [settings, setSettings] = useState<StoreSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [freeShippingEnabled, setFreeShippingEnabled] = useState(false);
  const [freeShippingType, setFreeShippingType] = useState<"always" | "minimum_value">("minimum_value");
  const [freeShippingMinValue, setFreeShippingMinValue] = useState("0");
  const [packagingDays, setPackagingDays] = useState("0");
  const [storeDeliveryFee, setStoreDeliveryFee] = useState("0");

  const fetchSettings = useCallback(async () => {
    try {
      const res = await fetch("/api/settings");
      const data: StoreSettings = await res.json();
      setSettings(data);
      setFreeShippingEnabled(data.freeShippingEnabled);
      setFreeShippingType((data.freeShippingType as "always" | "minimum_value") ?? "minimum_value");
      setFreeShippingMinValue(String(data.freeShippingMinValue ?? 0));
      setPackagingDays(String(data.packagingDays ?? 0));
      setStoreDeliveryFee(String(data.storeDeliveryFee ?? 0));
    } catch {
      setError("Não foi possível carregar as configurações.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSettings();
  }, [fetchSettings]);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const res = await fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          freeShippingEnabled,
          freeShippingType,
          freeShippingMinValue: parseFloat(freeShippingMinValue.replace(",", ".")) || 0,
          packagingDays: Math.max(0, Math.floor(Number(packagingDays) || 0)),
          storeDeliveryFee: parseFloat(storeDeliveryFee.replace(",", ".")) || 0,
        }),
      });
      if (!res.ok) throw new Error("Erro ao salvar.");
      const updated: StoreSettings = await res.json();
      invalidateSettingsCache();
      setSettings(updated);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch {
      setError("Não foi possível salvar as configurações.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <p className="text-sm text-stone-500">Carregando configurações…</p>;
  }

  const minVal = parseFloat(freeShippingMinValue.replace(",", ".")) || 0;
  const packagingDaysVal = Math.max(0, Math.floor(Number(packagingDays) || 0));
  const storeDeliveryFeeVal = parseFloat(storeDeliveryFee.replace(",", ".")) || 0;

  return (
    <div className="space-y-8">
      {/* Frete grátis */}
      <section className="rounded-xl border border-stone-200 bg-white p-6">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-stone-900">Frete grátis</h3>
            <p className="mt-1 text-sm text-stone-500">
              Configure quando o frete será grátis para os clientes.
              O frete não é cobrado no momento do pagamento.
            </p>
          </div>
          {/* Toggle */}
          <button
            type="button"
            role="switch"
            aria-checked={freeShippingEnabled}
            onClick={() => setFreeShippingEnabled((v) => !v)}
            className={`relative mt-0.5 h-6 w-11 shrink-0 rounded-full transition-colors duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-stone-900 focus-visible:ring-offset-2 ${
              freeShippingEnabled ? "bg-stone-900" : "bg-stone-200"
            }`}
          >
            <span
              className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
                freeShippingEnabled ? "translate-x-5" : "translate-x-0"
              }`}
            />
            <span className="sr-only">{freeShippingEnabled ? "Desativar" : "Ativar"} frete grátis</span>
          </button>
        </div>

        {freeShippingEnabled && (
          <div className="space-y-5">
            {/* Tipo */}
            <fieldset>
              <legend className="mb-3 text-sm font-medium text-stone-700">Condição do frete grátis</legend>
              <div className="space-y-3">
                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${freeShippingType === "always" ? "border-stone-900 bg-stone-50" : "border-stone-200 hover:border-stone-300"}`}>
                  <input
                    type="radio"
                    name="freeShippingType"
                    value="always"
                    checked={freeShippingType === "always"}
                    onChange={() => setFreeShippingType("always")}
                    className="mt-0.5 accent-stone-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-stone-900">Sempre grátis</p>
                    <p className="text-xs text-stone-500">Todos os pedidos terão frete grátis, independente do valor.</p>
                  </div>
                </label>

                <label className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors ${freeShippingType === "minimum_value" ? "border-stone-900 bg-stone-50" : "border-stone-200 hover:border-stone-300"}`}>
                  <input
                    type="radio"
                    name="freeShippingType"
                    value="minimum_value"
                    checked={freeShippingType === "minimum_value"}
                    onChange={() => setFreeShippingType("minimum_value")}
                    className="mt-0.5 accent-stone-900"
                  />
                  <div>
                    <p className="text-sm font-medium text-stone-900">A partir de um valor mínimo</p>
                    <p className="text-xs text-stone-500">Frete grátis quando o pedido atingir ou ultrapassar o valor configurado.</p>
                  </div>
                </label>
              </div>
            </fieldset>

            {/* Valor mínimo */}
            {freeShippingType === "minimum_value" && (
              <div>
                <label htmlFor="freeShippingMinValue" className="mb-1.5 block text-sm font-medium text-stone-700">
                  Valor mínimo para frete grátis
                </label>
                <div className="relative max-w-xs">
                  <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-stone-400">
                    R$
                  </span>
                  <input
                    id="freeShippingMinValue"
                    type="number"
                    min="0"
                    step="0.01"
                    value={freeShippingMinValue}
                    onChange={(e) => setFreeShippingMinValue(e.target.value)}
                    className="w-full rounded-lg border border-stone-200 bg-white py-3 pl-10 pr-4 text-sm text-stone-900 shadow-sm placeholder:text-stone-300 transition-colors focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
                    placeholder="150,00"
                  />
                </div>
                {minVal > 0 && (
                  <p className="mt-2 text-xs text-stone-500">
                    Clientes verão: <span className="font-medium text-stone-700">"Frete grátis acima de {formatPrice(minVal)}"</span>
                  </p>
                )}
              </div>
            )}

            {/* Preview */}
            <div className="rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3">
              <p className="text-sm font-medium text-emerald-800">
                {freeShippingType === "always"
                  ? "Todos os clientes terão frete grátis."
                  : minVal > 0
                  ? `Clientes com compras acima de ${formatPrice(minVal)} terão frete grátis.`
                  : "Defina um valor mínimo acima de R$ 0."}
              </p>
            </div>
          </div>
        )}

        {!freeShippingEnabled && settings && (
          <div className="rounded-lg border border-amber-100 bg-amber-50 px-4 py-3">
            <p className="text-sm text-amber-700">
              Frete grátis desativado. Os clientes verão o custo real do frete no checkout.
            </p>
          </div>
        )}
      </section>

      {/* Dias para embalar */}
      <section className="rounded-xl border border-stone-200 bg-white p-6">
        <h3 className="text-base font-semibold text-stone-900">Prazo de embalagem</h3>
        <p className="mt-1 text-sm text-stone-500">
          Dias úteis para preparar o pedido antes do envio. Esse prazo é somado automaticamente
          ao prazo de cada opção de frete exibida no checkout e na página do produto.
        </p>
        <div className="mt-5 max-w-xs">
          <label htmlFor="packagingDays" className="mb-1.5 block text-sm font-medium text-stone-700">
            Dias para embalar
          </label>
          <input
            id="packagingDays"
            type="number"
            min="0"
            max="30"
            step="1"
            value={packagingDays}
            onChange={(e) => setPackagingDays(e.target.value)}
            className="w-full rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm text-stone-900 shadow-sm placeholder:text-stone-300 transition-colors focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
            placeholder="0"
          />
          <p className="mt-2 text-xs text-stone-500">
            {packagingDaysVal === 0
              ? "Nenhum dia extra será adicionado aos prazos de frete."
              : packagingDaysVal === 1
              ? "Será adicionado 1 dia útil ao prazo de todas as opções de frete."
              : `Serão adicionados ${packagingDaysVal} dias úteis ao prazo de todas as opções de frete.`}
          </p>
        </div>
      </section>

      {/* Entrega pelo entregador da loja */}
      <section className="rounded-xl border border-stone-200 bg-white p-6">
        <h3 className="text-base font-semibold text-stone-900">Entregador da loja</h3>
        <p className="mt-1 text-sm text-stone-500">
          Valor cobrado como frete nas vendas avulsas quando a entrega é feita pelo entregador da loja.
        </p>
        <div className="mt-5 max-w-xs">
          <label htmlFor="storeDeliveryFee" className="mb-1.5 block text-sm font-medium text-stone-700">
            Valor da entrega
          </label>
          <div className="relative">
            <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm text-stone-400">
              R$
            </span>
            <input
              id="storeDeliveryFee"
              type="number"
              min="0"
              step="0.01"
              value={storeDeliveryFee}
              onChange={(e) => setStoreDeliveryFee(e.target.value)}
              className="w-full rounded-lg border border-stone-200 bg-white py-3 pl-10 pr-4 text-sm text-stone-900 shadow-sm placeholder:text-stone-300 transition-colors focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900"
              placeholder="0,00"
            />
          </div>
          <p className="mt-2 text-xs text-stone-500">
            {storeDeliveryFeeVal > 0
              ? `Valor salvo (${formatPrice(storeDeliveryFeeVal)}). Por enquanto, entregador da loja nas vendas avulsas fica como frete a combinar (não soma no pedido).`
              : "Por enquanto, entregador da loja nas vendas avulsas fica como frete a combinar."}
          </p>
        </div>
      </section>

      {/* Ações */}
      <div className="flex flex-wrap items-center justify-end gap-4">
        {saved && (
          <span className="flex items-center gap-1.5 text-sm text-emerald-600">
            <svg className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
            </svg>
            Salvo com sucesso!
          </span>
        )}
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="rounded-lg bg-sky-100 px-5 py-2.5 text-sm font-semibold text-sky-900 shadow-sm ring-1 ring-sky-200/80 transition-colors hover:bg-sky-200 disabled:opacity-50"
        >
          {saving ? "Salvando…" : "Salvar configurações"}
        </button>
      </div>
    </div>
  );
}
