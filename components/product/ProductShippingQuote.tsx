"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import { formatPrice } from "@/lib/format";

type ProductShippingQuoteProps = {
  productId: string;
  /** Unidades para somar o peso (dimensões = uma unidade). */
  quantity?: number;
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

export function ProductShippingQuote({
  productId,
  quantity = 1,
}: ProductShippingQuoteProps) {
  const qty = Math.min(9999, Math.max(1, Math.floor(quantity) || 1));
  const [cepDigits, setCepDigits] = useState("");
  const [options, setOptions] = useState<NormalizedShippingOption[] | null>(
    null
  );
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
          body: JSON.stringify({ destinationCep, productId, quantity: qty }),
          signal: ac.signal,
        });

        const data = (await res.json()) as {
          options?: NormalizedShippingOption[];
          error?: string;
          code?: string;
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
    [productId, qty]
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
  }, [cepDigits, runQuote, qty]);

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  return (
    <div className="rounded-lg border border-stone-200 bg-white px-4 py-4 space-y-3">
      <div>
        <label
          htmlFor="product-shipping-cep"
          className="block text-[10px] font-semibold uppercase tracking-widest text-stone-500 mb-2"
        >
          Simular frete
        </label>
        <div className="flex gap-2">
          <input
            id="product-shipping-cep"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            placeholder="00000-000"
            value={formatCepMask(cepDigits)}
            onChange={(e) => setCepDigits(onlyDigits(e.target.value))}
            className="flex-1 rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent"
          />
        </div>
        <p className="mt-1.5 text-xs text-stone-500">
          Digite o CEP para ver transportadoras, valores e prazos.
          {qty > 1 && (
            <span className="block mt-1 text-stone-600">
              Cotação para {qty} unidades (peso total proporcional; mesma caixa
              do cadastro).
            </span>
          )}
        </p>
      </div>

      {cepDigits.length > 0 && cepDigits.length < 8 && (
        <p className="text-xs text-stone-500">CEP incompleto.</p>
      )}

      {loading && (
        <div className="flex items-center gap-2 text-sm text-stone-600">
          <span
            className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-800"
            aria-hidden
          />
          Calculando frete…
        </div>
      )}

      {error && !loading && cepDigits.length === 8 && (
        <p className="text-sm text-red-700 bg-red-50 border border-red-100 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {!loading && options && options.length > 0 && (
        <ul className="space-y-2 pt-1">
          {options.map((o, index) => {
            const isCheap = cheapestIds.has(o.id);
            const isFast = fastestIds.has(o.id);
            return (
              <li
                key={`${index}-${o.id}-${o.serviceName}`}
                className={`rounded-md border px-3 py-2.5 text-sm ${
                  isCheap || isFast
                    ? "border-stone-900 bg-stone-50"
                    : "border-stone-200 bg-white"
                }`}
              >
                <div className="flex flex-wrap items-center gap-2 gap-y-1">
                  <span className="font-medium text-stone-900">
                    {o.carrierName}
                  </span>
                  {isCheap && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-emerald-700 text-white px-2 py-0.5 rounded">
                      Menor preço
                    </span>
                  )}
                  {isFast && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide bg-amber-700 text-white px-2 py-0.5 rounded">
                      Mais rápido
                    </span>
                  )}
                </div>
                <p className="text-stone-600 mt-0.5">{o.serviceName}</p>
                <div className="mt-1 flex flex-wrap justify-between gap-2 text-stone-800">
                  <span>{deliveryLabel(o)}</span>
                  <span className="font-semibold tabular-nums">
                    {formatPrice(o.price)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
