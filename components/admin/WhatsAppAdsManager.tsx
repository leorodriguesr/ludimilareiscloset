"use client";

import { useCallback, useEffect, useState } from "react";
import { formatPrice } from "@/lib/format";
import type {
  WhatsAppAdConversation,
  WhatsAppAdOutcome,
  WhatsAppAdReport,
} from "@/lib/admin/whatsapp-ad-report";

type DatePreset = "today" | "7d" | "month" | "custom";

function todayKey(): string {
  const date = new Date();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function shiftDayKey(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() + days);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function rangeForPreset(preset: DatePreset): { from: string; to: string } {
  const to = todayKey();
  if (preset === "today") return { from: to, to };
  if (preset === "7d") return { from: shiftDayKey(-6), to };
  return { from: `${to.slice(0, 7)}-01`, to };
}

function formatWhen(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

const OUTCOME_LABEL: Record<WhatsAppAdOutcome, string> = {
  sold: "Vendeu",
  open: "Na janela",
  expired: "Sem venda",
  cancelled: "Cancelada",
};

const OUTCOME_CLASS: Record<WhatsAppAdOutcome, string> = {
  sold: "bg-emerald-50 text-emerald-800 ring-emerald-100",
  open: "bg-sky-50 text-sky-800 ring-sky-100",
  expired: "bg-stone-100 text-stone-600 ring-stone-200",
  cancelled: "bg-red-50 text-red-700 ring-red-100",
};

export function WhatsAppAdsManager() {
  const initial = rangeForPreset("month");
  const [preset, setPreset] = useState<DatePreset>("month");
  const [from, setFrom] = useState(initial.from);
  const [to, setTo] = useState(initial.to);
  const [report, setReport] = useState<WhatsAppAdReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async (nextFrom: string, nextTo: string) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ from: nextFrom, to: nextTo });
      const response = await fetch(`/api/admin/whatsapp-ads?${params}`);
      const data = (await response.json()) as WhatsAppAdReport & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Não foi possível carregar.");
        return;
      }
      setReport(data);
    } catch {
      setError("Não foi possível carregar.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(initial.from, initial.to);
  }, [load, initial.from, initial.to]);

  function applyPreset(next: DatePreset) {
    const range = rangeForPreset(next);
    setPreset(next);
    setFrom(range.from);
    setTo(range.to);
    void load(range.from, range.to);
  }

  const maxConversations = Math.max(
    1,
    ...(report?.rankings.map((item) => item.conversations) ?? [1])
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-stone-500">
            WhatsApp
          </p>
          <h2 className="mt-1 text-lg font-semibold text-stone-900">
            Anúncios que viraram conversa
          </h2>
          <p className="mt-1 max-w-xl text-sm text-stone-500">
            Cada linha é alguém que clicou no anúncio e mandou mensagem. A venda
            entra quando o pedido desse telefone fica pago, dentro de 7 dias.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {(
            [
              ["today", "Hoje"],
              ["7d", "7 dias"],
              ["month", "Mês"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => applyPreset(id)}
              className={`h-8 rounded-lg px-3 text-xs font-semibold ${
                preset === id
                  ? "bg-stone-900 text-white"
                  : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-50"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <form
        className="flex flex-wrap items-center gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          setPreset("custom");
          void load(from, to);
        }}
      >
        <input
          type="date"
          value={from}
          onChange={(event) => {
            setFrom(event.target.value);
            setPreset("custom");
          }}
          className="h-8 rounded-lg border border-stone-200 bg-white px-2.5 text-sm text-stone-800"
        />
        <span className="text-xs text-stone-400">até</span>
        <input
          type="date"
          value={to}
          onChange={(event) => {
            setTo(event.target.value);
            setPreset("custom");
          }}
          className="h-8 rounded-lg border border-stone-200 bg-white px-2.5 text-sm text-stone-800"
        />
        <button
          type="submit"
          disabled={loading}
          className="h-8 rounded-lg bg-sky-100 px-3 text-xs font-semibold text-sky-900 ring-1 ring-sky-200/80 disabled:opacity-50"
        >
          Aplicar
        </button>
      </form>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      {loading && !report ? (
        <div className="flex items-center gap-2.5 py-16 text-sm text-stone-400">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-stone-200 border-t-stone-700" />
          Carregando anúncios…
        </div>
      ) : report ? (
        <div className={`space-y-5 ${loading ? "opacity-60" : ""}`}>
          <p className="rounded-2xl border border-stone-200 bg-stone-50 px-4 py-3 text-sm leading-relaxed text-stone-700">
            {report.insight}
          </p>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <Metric
              label="Chamaram"
              value={report.conversations.toLocaleString("pt-BR")}
              detail={`${report.openWindow.toLocaleString("pt-BR")} ainda na janela de 7 dias`}
            />
            <Metric
              label="Venderam"
              value={report.sales.toLocaleString("pt-BR")}
              detail={`${report.conversionRate.toLocaleString("pt-BR")}% das conversas`}
            />
            <Metric
              label="Receita"
              value={formatPrice(report.revenue)}
              detail={`Ticket médio ${formatPrice(report.averageTicket)}`}
            />
            <Metric
              label="Por conversa"
              value={formatPrice(report.revenuePerConversation)}
              detail={
                report.fastestHours == null
                  ? "Nenhuma venda fechada no período"
                  : `Venda mais rápida em ${report.fastestHours.toLocaleString("pt-BR")} h`
              }
            />
          </section>

          <section className="rounded-2xl border border-stone-200 bg-white p-5 shadow-sm">
            <h3 className="text-sm font-semibold text-stone-900">
              Qual anúncio trouxe mais
            </h3>
            {report.rankings.length === 0 ? (
              <p className="mt-4 text-sm text-stone-500">
                Quando a primeira mensagem do anúncio chegar, o ranking aparece
                aqui, com chamadas, vendas e receita.
              </p>
            ) : (
              <ul className="mt-4 space-y-4">
                {report.rankings.map((item) => (
                  <li key={item.adKey}>
                    <div className="flex flex-wrap items-end justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-stone-900">
                          {item.adLabel}
                        </p>
                        {item.campaignLabel ? (
                          <p className="text-xs text-stone-500">{item.campaignLabel}</p>
                        ) : null}
                      </div>
                      <p className="text-sm tabular-nums text-stone-700">
                        {item.conversations} chamadas · {item.sales} vendas ·{" "}
                        {formatPrice(item.revenue)} · {item.conversionRate}%
                      </p>
                    </div>
                    <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-stone-100">
                      <div
                        className="h-full rounded-full bg-stone-900"
                        style={{
                          width: `${Math.max(6, (item.conversations / maxConversations) * 100)}%`,
                        }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="overflow-hidden rounded-2xl border border-stone-200 bg-white shadow-sm">
            <div className="border-b border-stone-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-stone-900">Conversas</h3>
              <p className="mt-1 text-xs text-stone-500">
                {report.expired.toLocaleString("pt-BR")} encerraram os 7 dias sem
                compra
                {report.cancelled > 0
                  ? ` · ${report.cancelled.toLocaleString("pt-BR")} canceladas`
                  : ""}
              </p>
            </div>
            {report.recent.length === 0 ? (
              <p className="px-5 py-8 text-sm text-stone-500">
                Nenhuma conversa neste período.
              </p>
            ) : (
              <ul className="divide-y divide-stone-100">
                {report.recent.map((item) => (
                  <ConversationRow key={item.id} item={item} />
                ))}
              </ul>
            )}
          </section>
        </div>
      ) : null}
    </div>
  );
}

function Metric({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <article className="rounded-2xl border border-stone-200 bg-white p-4 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-stone-500">
        {label}
      </p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-stone-900">
        {value}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-stone-500">{detail}</p>
    </article>
  );
}

function ConversationRow({ item }: { item: WhatsAppAdConversation }) {
  return (
    <li className="flex flex-col gap-2 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium text-stone-900">
          {item.customerName || item.phone}
          {item.customerName ? (
            <span className="ml-2 font-normal text-stone-500">{item.phone}</span>
          ) : null}
        </p>
        <p className="mt-0.5 truncate text-sm text-stone-600">{item.adLabel}</p>
        <p className="mt-0.5 text-xs text-stone-400">
          {formatWhen(item.clickedAt)}
          {item.campaignLabel ? ` · ${item.campaignLabel}` : ""}
          {item.orderNumber ? ` · pedido #${item.orderNumber}` : ""}
          {item.outcome === "sold" && !item.reportedToMeta
            ? " · compra ainda não confirmada na Meta"
            : ""}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {item.outcome === "sold" ? (
          <span className="text-sm font-medium tabular-nums text-stone-900">
            {formatPrice(item.revenue)}
          </span>
        ) : null}
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${OUTCOME_CLASS[item.outcome]}`}
        >
          {OUTCOME_LABEL[item.outcome]}
        </span>
      </div>
    </li>
  );
}
