"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import { formatPrice } from "@/lib/format";

export type CheckoutShippingSelection = {
  destinationCep: string;
  optionId: string;
  shippingPrice: number;
};

type Props = {
  lines: { productId: string; quantity: number }[];
  onFulfillmentChange: (ready: CheckoutShippingSelection | null) => void;
};

function onlyDigits(s: string): string {
  return s.replace(/\D/g, "").slice(0, 8);
}

function formatCepMask(digits: string): string {
  if (digits.length <= 5) return digits;
  return `${digits.slice(0, 5)}-${digits.slice(5)}`;
}

function deliveryLabel(o: NormalizedShippingOption): string {
  const { deliveryDaysMin: a, deliveryDaysMax: b } = o;
  if (a <= 0 && b <= 0) return "Prazo sob consulta";
  if (a === b) return `${a} dia(s) útil(is)`;
  return `${a} a ${b} dias úteis`;
}

function rankHighlights(options: NormalizedShippingOption[]) {
  if (options.length === 0) {
    return { cheapestIds: new Set<string>(), fastestIds: new Set<string>() };
  }

  const minPrice = Math.min(...options.map((o) => o.price));
  const cheapestIds = new Set(
    options.filter((o) => o.price === minPrice).map((o) => o.id)
  );

  const known = options.filter((o) => o.deliveryDaysMin > 0 || o.deliveryDaysMax > 0);
  if (known.length === 0) {
    return { cheapestIds, fastestIds: new Set<string>() };
  }

  const score = (o: NormalizedShippingOption) =>
    o.deliveryDaysMin > 0
      ? o.deliveryDaysMin * 1000 + o.deliveryDaysMax
      : o.deliveryDaysMax * 1000;

  const best = Math.min(...known.map(score));
  const fastestIds = new Set(
    known.filter((o) => score(o) === best).map((o) => o.id)
  );

  return { cheapestIds, fastestIds };
}

export function CheckoutShippingSection({
  lines,
  onFulfillmentChange,
}: Props) {
  const [cepDigits, setCepDigits] = useState(() => {
    try { return sessionStorage.getItem("shipping_cep") ?? ""; } catch { return ""; }
  });
  const [options, setOptions] = useState<NormalizedShippingOption[] | null>(
    null
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const { cheapestIds, fastestIds } = useMemo(
    () => rankHighlights(options ?? []),
    [options]
  );

  const runQuote = useCallback(
    async (destinationCep: string) => {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      setLoading(true);
      setError(null);

      try {
        const res = await fetch("/api/shipping", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ destinationCep, lines }),
          signal: ac.signal,
        });

        const data = (await res.json()) as {
          options?: NormalizedShippingOption[];
          error?: string;
        };

        if (!res.ok) {
          setOptions(null);
          setError(
            data.error ||
              (res.status === 503
                ? "Cálculo de frete indisponível no momento."
                : "Não foi possível calcular o frete.")
          );
          return;
        }

        if (!data.options?.length) {
          setOptions([]);
          setError("Nenhuma opção de frete para este CEP.");
          return;
        }

        setOptions(data.options);
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setOptions(null);
        setError("Erro de conexão. Tente novamente.");
      } finally {
        setLoading(false);
      }
    },
    [lines]
  );

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (cepDigits.length !== 8) {
      setOptions(null);
      setError(null);
      setLoading(false);
      return;
    }

    debounceRef.current = setTimeout(() => {
      void runQuote(cepDigits);
    }, 450);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [cepDigits, runQuote]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    if (!options?.length) {
      setSelectedId(null);
      return;
    }
    const firstCheap =
      options.find((o) => cheapestIds.has(o.id)) ?? options[0] ?? null;
    setSelectedId((prev) =>
      prev && options.some((o) => o.id === prev) ? prev : firstCheap?.id ?? null
    );
  }, [options, cheapestIds]);

  useEffect(() => {
    if (cepDigits.length !== 8 || !selectedId || !options?.length) {
      onFulfillmentChange(null);
      return;
    }
    const o = options.find((x) => x.id === selectedId);
    if (!o) {
      onFulfillmentChange(null);
      return;
    }
    onFulfillmentChange({
      destinationCep: cepDigits,
      optionId: selectedId,
      shippingPrice: o.price,
    });
  }, [cepDigits, selectedId, options, onFulfillmentChange]);

  return (
    <div className="space-y-3">
      {/* Label + input */}
      <div>
        <label
          htmlFor="checkout-shipping-cep"
          className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-stone-500 mb-2"
        >
          <svg className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 0 1-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 0 1-3 0m3 0a1.5 1.5 0 0 0-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 0 0-3.213-9.193 2.056 2.056 0 0 0-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 0 0-10.026 0 1.106 1.106 0 0 0-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
          </svg>
          Frete e entrega
        </label>
        <div className="flex items-center gap-2">
          <input
            id="checkout-shipping-cep"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={formatCepMask(cepDigits)}
            onChange={(e) => {
              const digits = onlyDigits(e.target.value);
              setCepDigits(digits);
              if (digits.length === 8) {
                try { sessionStorage.setItem("shipping_cep", digits); } catch {}
              }
            }}
            className="w-36 rounded-lg border border-stone-300 bg-white px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:border-stone-900 focus:outline-none focus:ring-1 focus:ring-stone-900 transition-colors"
          />
          {loading && (
            <span className="inline-flex items-center gap-1.5 text-xs text-stone-400">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-stone-200 border-t-stone-600" />
              Calculando…
            </span>
          )}
        </div>
        {cepDigits.length > 0 && cepDigits.length < 8 && (
          <p className="mt-1 text-xs text-stone-400">CEP incompleto</p>
        )}
      </div>

      {/* Erro */}
      {error && !loading && cepDigits.length === 8 && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {/* Opções seleccionáveis */}
      {!loading && options && options.length > 0 && (
        <ul className="overflow-hidden rounded-lg border border-stone-200 divide-y divide-stone-100">
          {options.map((o, index) => {
            const isCheap = cheapestIds.has(o.id);
            const isFast = fastestIds.has(o.id);
            const id = `ship-opt-${index}-${o.id}`;
            return (
              <li key={`${o.id}-${index}`}>
                <label
                  htmlFor={id}
                  className={`flex cursor-pointer items-start gap-3 px-3 py-2.5 text-sm transition-colors ${
                    selectedId === o.id ? "bg-stone-50" : "bg-white hover:bg-stone-50/60"
                  }`}
                >
                  <input
                    id={id}
                    type="radio"
                    name="checkout-shipping-option"
                    className="mt-0.5 shrink-0 border-stone-300 text-stone-900 focus:ring-stone-900"
                    checked={selectedId === o.id}
                    onChange={() => setSelectedId(o.id)}
                  />
                  <div className="min-w-0 flex-1">
                    {/* Linha 1: transportadora + badges */}
                    <div className="flex items-center justify-between gap-2">
                      <span className={`font-medium ${selectedId === o.id ? "text-stone-900" : "text-stone-700"}`}>
                        {o.carrierName}
                      </span>
                      <div className="flex shrink-0 items-center gap-1">
                        {isCheap && (
                          <span className="rounded bg-emerald-600 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                            Menor preço
                          </span>
                        )}
                        {isFast && (
                          <span className="rounded bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-white">
                            Mais rápido
                          </span>
                        )}
                      </div>
                    </div>
                    {/* Linha 2: serviço + prazo · preço */}
                    <div className="mt-0.5 flex items-center justify-between gap-2">
                      <span className="text-xs text-stone-500">
                        {o.serviceName} · {deliveryLabel(o)}
                      </span>
                      <span className={`shrink-0 text-xs font-semibold tabular-nums ${o.price === 0 ? "text-emerald-600" : "text-stone-900"}`}>
                        {o.price === 0 ? "Grátis" : formatPrice(o.price)}
                      </span>
                    </div>
                  </div>
                </label>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
