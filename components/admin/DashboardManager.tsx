"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type DashboardStateRow = {
  state: string;
  count: number;
};

type DashboardMetrics = {
  from: string;
  to: string;
  paidCount: number;
  cancelledCount: number;
  waitingCount: number;
  productsSoldCount: number;
  outboundSalesCount: number;
  inboundSalesCount: number;
  motoboyDeliveriesCount: number;
  salesByState: DashboardStateRow[];
};

type DatePreset = "today" | "7d" | "month" | "custom";

function todayKey(): string {
  const date = new Date();
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function shiftDayKey(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function currentMonthRange(): { from: string; to: string } {
  const to = todayKey();
  return { from: `${to.slice(0, 7)}-01`, to };
}

function rangeForPreset(preset: DatePreset): { from: string; to: string } {
  const to = todayKey();
  if (preset === "today") return { from: to, to };
  if (preset === "7d") return { from: shiftDayKey(-6), to };
  return currentMonthRange();
}

function formatDateLabel(value: string): string {
  const [year, month, day] = value.split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}

function formatRangeLabel(from: string, to: string): string {
  if (from === to) return formatDateLabel(from);
  return `${formatDateLabel(from)} – ${formatDateLabel(to)}`;
}

function percent(part: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((part / total) * 100);
}

function shareWidth(part: number, total: number): string {
  if (total <= 0 || part <= 0) return "0%";
  return `${Math.max((part / total) * 100, 4)}%`;
}

const STATE_NAMES: Record<string, string> = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
};

function describeState(value: string): { uf: string; name: string } {
  const trimmed = value.trim();
  if (!trimmed || trimmed.toLowerCase() === "não informado") {
    return { uf: "—", name: "Não informado" };
  }

  const uf = trimmed.toUpperCase();
  if (STATE_NAMES[uf]) return { uf, name: STATE_NAMES[uf] };

  const match = Object.entries(STATE_NAMES).find(
    ([, name]) => name.toLocaleLowerCase("pt-BR") === trimmed.toLocaleLowerCase("pt-BR")
  );
  if (match) return { uf: match[0], name: match[1] };

  return { uf: trimmed.slice(0, 2).toUpperCase(), name: trimmed };
}

export function DashboardManager() {
  const defaults = useMemo(() => currentMonthRange(), []);
  const [preset, setPreset] = useState<DatePreset>("month");
  const [from, setFrom] = useState(defaults.from);
  const [to, setTo] = useState(defaults.to);
  const [appliedFrom, setAppliedFrom] = useState(defaults.from);
  const [appliedTo, setAppliedTo] = useState(defaults.to);
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchMetrics = useCallback(async (rangeFrom: string, rangeTo: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: rangeFrom, to: rangeTo });
      const res = await fetch(`/api/admin/dashboard?${params}`);
      const data = (await res.json()) as DashboardMetrics & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Não foi possível carregar o dashboard.");
        return;
      }
      setMetrics(data);
      setAppliedFrom(data.from);
      setAppliedTo(data.to);
    } catch {
      setError("Erro de conexão ao carregar o dashboard.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchMetrics(defaults.from, defaults.to);
  }, [defaults.from, defaults.to, fetchMetrics]);

  function applyRange(nextFrom: string, nextTo: string, nextPreset: DatePreset) {
    const ordered =
      nextFrom <= nextTo
        ? { from: nextFrom, to: nextTo }
        : { from: nextTo, to: nextFrom };
    setFrom(ordered.from);
    setTo(ordered.to);
    setPreset(nextPreset);
    void fetchMetrics(ordered.from, ordered.to);
  }

  function applyPreset(next: DatePreset) {
    if (next === "custom") {
      setPreset("custom");
      return;
    }
    const range = rangeForPreset(next);
    applyRange(range.from, range.to, next);
  }

  const periodLabel = formatRangeLabel(appliedFrom, appliedTo);
  const totalOrders =
    (metrics?.paidCount ?? 0) +
    (metrics?.waitingCount ?? 0) +
    (metrics?.cancelledCount ?? 0);
  const fulfillmentTotal =
    (metrics?.outboundSalesCount ?? 0) + (metrics?.inboundSalesCount ?? 0);
  const maxStateCount = Math.max(
    ...(metrics?.salesByState.map((row) => row.count) ?? [0]),
    1
  );
  const piecesPerSale =
    metrics && metrics.paidCount > 0
      ? metrics.productsSoldCount / metrics.paidCount
      : 0;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h2 className="text-lg font-semibold text-stone-900">Dashboard</h2>
        </div>

        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <div className="inline-flex rounded-lg border border-stone-200 bg-white p-0.5">
            {(
              [
                ["today", "Hoje"],
                ["7d", "7 dias"],
                ["month", "Este mês"],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => applyPreset(id)}
                disabled={loading}
                className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
                  preset === id
                    ? "bg-stone-900 text-white"
                    : "text-stone-600 hover:bg-stone-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              applyRange(from || to, to || from, "custom");
            }}
          >
            <input
              type="date"
              value={from}
              onChange={(event) => {
                setFrom(event.target.value);
                setPreset("custom");
              }}
              className="box-border h-8 rounded-lg border border-stone-200 bg-white px-2.5 text-sm text-stone-800 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
            />
            <span className="text-xs text-stone-400">até</span>
            <input
              type="date"
              value={to}
              onChange={(event) => {
                setTo(event.target.value);
                setPreset("custom");
              }}
              className="box-border h-8 rounded-lg border border-stone-200 bg-white px-2.5 text-sm text-stone-800 focus:border-stone-400 focus:outline-none focus:ring-2 focus:ring-stone-200"
            />
            <button
              type="submit"
              disabled={loading}
              className="box-border h-8 rounded-lg bg-stone-900 px-3 text-xs font-semibold text-white hover:bg-stone-800 disabled:opacity-50"
            >
              Aplicar
            </button>
          </form>
        </div>
      </div>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading && !metrics ? (
        <div className="flex items-center gap-2.5 py-16 text-sm text-stone-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" />
          Carregando métricas…
        </div>
      ) : metrics ? (
        <div className={`space-y-4 ${loading ? "opacity-60" : ""}`}>
          <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                    Vendas
                  </p>
                  <p className="mt-2 text-5xl font-semibold tabular-nums tracking-tight text-stone-900">
                    {metrics.paidCount.toLocaleString("pt-BR")}
                  </p>
                </div>
                <p className="max-w-[14rem] pb-1 text-xs leading-relaxed text-stone-500">
                  Pagamentos confirmados no período selecionado
                </p>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-emerald-50 px-4 py-3 ring-1 ring-emerald-100">
                  <p className="text-2xl font-semibold tabular-nums text-stone-900">
                    {metrics.productsSoldCount.toLocaleString("pt-BR")}
                  </p>
                  <p className="mt-1 text-sm font-medium text-emerald-800">
                    Peças vendidas
                  </p>
                  <p className="mt-0.5 text-xs text-emerald-800/70">
                    Soma das peças vendidas
                  </p>
                </div>
                <div className="rounded-xl bg-sky-50 px-4 py-3 ring-1 ring-sky-100">
                  <p className="text-2xl font-semibold tabular-nums text-stone-900">
                    {piecesPerSale.toLocaleString("pt-BR", {
                      maximumFractionDigits: 1,
                    })}
                  </p>
                  <p className="mt-1 text-sm font-medium text-sky-800">
                    Peças por venda
                  </p>
                  <p className="mt-0.5 text-xs text-sky-800/70">
                    Média de itens em cada venda paga
                  </p>
                </div>
              </div>
            </section>

            <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex items-baseline justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                  Pedidos no período
                </h3>
                <span className="text-xs tabular-nums text-stone-500">
                  {totalOrders.toLocaleString("pt-BR")} no total
                </span>
              </div>

              <div className="mt-4 flex h-1.5 overflow-hidden rounded-full bg-stone-100">
                <span
                  className="bg-emerald-500"
                  style={{ width: shareWidth(metrics.paidCount, totalOrders) }}
                />
                <span
                  className="bg-amber-400"
                  style={{
                    width: shareWidth(metrics.waitingCount, totalOrders),
                  }}
                />
                <span
                  className="bg-rose-400"
                  style={{
                    width: shareWidth(metrics.cancelledCount, totalOrders),
                  }}
                />
              </div>

              <ul className="mt-5 space-y-3">
                <StatusRow
                  color="bg-emerald-500"
                  label="Pagas"
                  value={metrics.paidCount}
                  share={percent(metrics.paidCount, totalOrders)}
                />
                <StatusRow
                  color="bg-amber-400"
                  label="Aguardando"
                  value={metrics.waitingCount}
                  share={percent(metrics.waitingCount, totalOrders)}
                />
                <StatusRow
                  color="bg-rose-400"
                  label="Canceladas"
                  value={metrics.cancelledCount}
                  share={percent(metrics.cancelledCount, totalOrders)}
                />
              </ul>
            </section>
          </div>

          <div className="grid gap-4 lg:grid-cols-2 lg:items-stretch">
            <section className="flex flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                Destino das vendas
              </h3>
              <p className="mt-0.5 text-xs text-stone-500">
                Como as entregas saíram no período
              </p>

              <div className="mt-5 grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="flex flex-col justify-between rounded-xl border border-stone-100 border-l-2 border-l-sky-400 bg-stone-50/80 px-4 py-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-sky-700">
                      Para fora
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Transportadora e demais envios
                    </p>
                  </div>
                  <div className="mt-6">
                    <p className="text-4xl font-semibold tabular-nums tracking-tight text-stone-900">
                      {metrics.outboundSalesCount.toLocaleString("pt-BR")}
                    </p>
                    <p className="mt-1 text-sm font-medium text-sky-700">
                      {percent(metrics.outboundSalesCount, fulfillmentTotal)}%
                      das pagas
                    </p>
                  </div>
                </div>

                <div className="flex flex-col justify-between rounded-xl border border-stone-100 border-l-2 border-l-teal-400 bg-stone-50/80 px-4 py-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-teal-700">
                      Para dentro
                    </p>
                    <p className="mt-1 text-xs text-stone-500">
                      Motoboy, retirada e Uber
                    </p>
                  </div>
                  <div className="mt-6">
                    <p className="text-4xl font-semibold tabular-nums tracking-tight text-stone-900">
                      {metrics.inboundSalesCount.toLocaleString("pt-BR")}
                    </p>
                    <p className="mt-1 text-sm font-medium text-teal-700">
                      {percent(metrics.inboundSalesCount, fulfillmentTotal)}%
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-3 flex items-center justify-between rounded-xl border border-stone-100 border-l-2 border-l-orange-400 bg-stone-50/80 px-4 py-3">
                <div>
                  <p className="text-xs font-semibold text-orange-800">
                    Entregas motoboy
                  </p>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Só entregador da loja
                  </p>
                </div>
                <p className="text-2xl font-semibold tabular-nums text-stone-900">
                  {metrics.motoboyDeliveriesCount.toLocaleString("pt-BR")}
                </p>
              </div>
            </section>

            <section className="flex min-h-0 flex-col rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-stone-900">
                    Vendas por Estado
                  </h3>
                  <p className="mt-0.5 text-xs text-stone-500">
                    Ranking pelo endereço de entrega
                  </p>
                </div>
                {metrics.salesByState.length > 0 ? (
                  <p className="text-xs text-stone-500">
                    {metrics.salesByState.length}{" "}
                    {metrics.salesByState.length === 1 ? "estado" : "estados"}
                  </p>
                ) : null}
              </div>

              {metrics.salesByState.length === 0 ? (
                <p className="py-10 text-center text-sm text-stone-400">
                  Nenhuma venda paga no período.
                </p>
              ) : (
                <ol className="mt-4 min-h-0 flex-1 divide-y divide-stone-100 overflow-y-auto lg:max-h-[22rem]">
                  {metrics.salesByState.map((row, index) => {
                    const { uf, name } = describeState(row.state);
                    const share = percent(row.count, metrics.paidCount);
                    const bar = Math.max((row.count / maxStateCount) * 100, 4);
                    return (
                      <li
                        key={row.state}
                        className="flex items-center gap-3 py-2.5"
                      >
                        <span className="w-5 shrink-0 text-xs tabular-nums text-stone-400">
                          {index + 1}
                        </span>
                        <div className="w-24 min-w-0 shrink-0 sm:w-32">
                          <p className="truncate text-sm font-medium text-stone-900">
                            {name}
                          </p>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-sky-700">
                            {uf}
                          </p>
                        </div>
                        <div className="hidden h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-sky-50 sm:block">
                          <div
                            className="h-full rounded-full bg-sky-500"
                            style={{ width: `${bar}%` }}
                          />
                        </div>
                        <span className="w-10 shrink-0 text-right text-sm font-semibold tabular-nums text-stone-900">
                          {row.count.toLocaleString("pt-BR")}
                        </span>
                        <span className="w-10 shrink-0 text-right text-xs tabular-nums text-sky-700">
                          {share}%
                        </span>
                      </li>
                    );
                  })}
                </ol>
              )}
            </section>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function StatusRow({
  color,
  label,
  value,
  share,
}: {
  color: string;
  label: string;
  value: number;
  share: number;
}) {
  return (
    <li className="flex items-center justify-between gap-3 text-sm">
      <span className="flex items-center gap-2 text-stone-700">
        <span className={`h-1.5 w-1.5 rounded-full ${color}`} />
        {label}
      </span>
      <span className="tabular-nums text-stone-900">
        {value.toLocaleString("pt-BR")}
        <span className="ml-2 text-xs text-stone-400">{share}%</span>
      </span>
    </li>
  );
}
