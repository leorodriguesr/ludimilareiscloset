"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { NormalizedShippingOption } from "@/lib/shipping/types";
import { formatPrice } from "@/lib/format";
import { useStoreSettings } from "@/lib/hooks/use-store-settings";
import { checkFreeShipping } from "@/lib/shipping/free-shipping";

type ProductShippingQuoteProps = {
  productId: string;
  /** Unidades para somar o peso (dimensões = uma unidade). */
  quantity?: number;
  /** Preço unitário do produto — usado para checar elegibilidade ao frete grátis. */
  productPrice?: number;
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
  productPrice,
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
  const { settings } = useStoreSettings();

  // Verifica frete grátis com base no preço do produto × quantidade
  const orderTotal = (productPrice ?? 0) * qty;
  const freeShippingResult = settings
    ? checkFreeShipping(settings, orderTotal)
    : null;
  const isFreeShipping = freeShippingResult?.isFree ?? false;

  // Quando frete grátis, ordena do mais barato para o mais caro
  const displayOptions = useMemo(() => {
    if (!options) return null;
    if (isFreeShipping) {
      return [...options].sort((a, b) => a.price - b.price);
    }
    return options;
  }, [options, isFreeShipping]);

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
        <input
          id="product-shipping-cep"
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
          className="w-full rounded-md border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-900 focus:border-transparent"
        />
        <p className="mt-1.5 text-xs text-stone-500">
          Digite o CEP para ver transportadoras, valores e prazos.
          {qty > 1 && (
            <span className="block mt-1 text-stone-600">
              Cotação para {qty} unidades.
            </span>
          )}
        </p>
        {cepDigits.length > 0 && cepDigits.length < 8 && (
          <p className="mt-1 text-xs text-stone-400">CEP incompleto.</p>
        )}
      </div>

      {loading && (
        <div className="flex items-center gap-2 text-sm text-stone-500">
          <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" aria-hidden />
          Calculando frete…
        </div>
      )}

      {error && !loading && cepDigits.length === 8 && (
        <p className="text-xs text-red-600">{error}</p>
      )}

      {/* Mensagem de frete grátis quando aplicável */}
      {settings?.freeShippingEnabled && freeShippingResult && !isFreeShipping && freeShippingResult.missingAmount != null && (
        <div className="space-y-1.5">
          <p className="text-xs text-stone-600">
            Falta <span className="font-semibold text-stone-900">{formatPrice(freeShippingResult.missingAmount)}</span> para{" "}
            <span className="font-semibold text-stone-900">frete grátis</span>
          </p>
          {freeShippingResult.minValue != null && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-stone-200">
              <div
                className="h-full rounded-full bg-stone-900 transition-all duration-500"
                style={{ width: `${Math.min(100, (orderTotal / freeShippingResult.minValue) * 100)}%` }}
              />
            </div>
          )}
        </div>
      )}
      {isFreeShipping && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
          <svg className="h-3.5 w-3.5 shrink-0 text-emerald-600" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-xs font-medium text-emerald-700">Frete grátis neste pedido!</p>
        </div>
      )}

      {/* Lista de opções */}
      {!loading && displayOptions && displayOptions.length > 0 && (
        <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 overflow-hidden">
          {displayOptions.map((o, index) => {
            const isFree = isFreeShipping && index === 0;
            return (
              <li
                key={`${index}-${o.id}-${o.serviceName}`}
                className="flex items-center justify-between gap-4 bg-white px-4 py-3.5"
              >
                {/* Esquerda: nome + prazo */}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-stone-900 leading-snug">
                    {o.carrierName}
                    {o.serviceName ? ` — ${o.serviceName}` : ""}
                  </p>
                  <div className="mt-1 flex items-center gap-1 text-xs text-stone-400">
                    <svg className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth={1.5} viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                    </svg>
                    <span>{deliveryLabel(o)}</span>
                  </div>
                </div>

                {/* Direita: preço */}
                <div className="shrink-0 text-right">
                  {isFree ? (
                    <>
                      <p className="text-base font-bold text-emerald-600">Grátis</p>
                      {o.price > 0 && (
                        <p className="text-xs tabular-nums text-stone-400 line-through">{formatPrice(o.price)}</p>
                      )}
                    </>
                  ) : (
                    <p className={`text-base font-bold tabular-nums ${o.price === 0 ? "text-emerald-600" : "text-stone-900"}`}>
                      {o.price === 0 ? "Grátis" : formatPrice(o.price)}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
