import { WHATSAPP_CLICK_WINDOW_MS } from "@/lib/meta/purchase-match";

export type WhatsAppAdOutcome = "sold" | "cancelled" | "open" | "expired";

export type WhatsAppAdClickRow = {
  id: string;
  phoneKey: string;
  clickedAt: Date;
  sourceId: string | null;
  sourceUrl: string | null;
  headline: string | null;
  bodyText: string | null;
  adName: string | null;
  adsetName: string | null;
  campaignId: string | null;
  campaignName: string | null;
  status: "AVAILABLE" | "USED";
  sentAt: Date | null;
  order: {
    id: string;
    orderNumber: number | null;
    total: number;
    paidAt: Date | null;
    status: string;
    recipientName: string | null;
  } | null;
};

export type WhatsAppAdConversation = {
  id: string;
  phone: string;
  clickedAt: string;
  outcome: WhatsAppAdOutcome;
  adKey: string;
  adLabel: string;
  campaignLabel: string | null;
  headline: string | null;
  sourceUrl: string | null;
  orderId: string | null;
  orderNumber: number | null;
  customerName: string | null;
  revenue: number;
  hoursToSale: number | null;
  reportedToMeta: boolean;
};

export type WhatsAppAdRanking = {
  adKey: string;
  adLabel: string;
  campaignLabel: string | null;
  headline: string | null;
  conversations: number;
  sales: number;
  revenue: number;
  conversionRate: number;
};

export type WhatsAppAdReport = {
  from: string;
  to: string;
  conversations: number;
  sales: number;
  cancelled: number;
  openWindow: number;
  expired: number;
  revenue: number;
  conversionRate: number;
  averageTicket: number;
  revenuePerConversation: number;
  fastestHours: number | null;
  rankings: WhatsAppAdRanking[];
  recent: WhatsAppAdConversation[];
  insight: string;
};

const PAID = "paid";
const CANCELLED = "cancelled";

export function formatWhatsAppPhone(phoneKey: string): string {
  const digits = phoneKey.replace(/\D/g, "").replace(/^55/, "");
  if (digits.length === 11) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return phoneKey;
}

export function adLabelOf(row: {
  adName: string | null;
  headline: string | null;
  sourceId: string | null;
}): string {
  if (row.adName?.trim()) return row.adName.trim();
  if (row.headline?.trim()) return row.headline.trim();
  if (row.sourceId?.trim()) return `Anúncio ${row.sourceId.trim()}`;
  return "Anúncio sem identificação";
}

export function campaignLabelOf(row: {
  campaignName: string | null;
  adsetName: string | null;
}): string | null {
  const campaign = row.campaignName?.trim();
  const adset = row.adsetName?.trim();
  if (campaign && adset) return `${campaign} · ${adset}`;
  return campaign || adset || null;
}

function outcomeOf(row: WhatsAppAdClickRow, now: Date): WhatsAppAdOutcome {
  if (row.order?.status === CANCELLED) return "cancelled";
  if (row.order?.status === PAID || row.order?.paidAt) return "sold";
  if (now.getTime() - row.clickedAt.getTime() <= WHATSAPP_CLICK_WINDOW_MS) {
    return "open";
  }
  return "expired";
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function buildWhatsAppAdReport(input: {
  from: string;
  to: string;
  rows: WhatsAppAdClickRow[];
  now: Date;
}): WhatsAppAdReport {
  const recent = input.rows
    .slice()
    .sort((a, b) => b.clickedAt.getTime() - a.clickedAt.getTime())
    .map((row): WhatsAppAdConversation => {
      const outcome = outcomeOf(row, input.now);
      const sold = outcome === "sold";
      const hours =
        sold && row.order?.paidAt
          ? Math.max(
              0,
              Math.round(
                ((row.order.paidAt.getTime() - row.clickedAt.getTime()) /
                  36e5) *
                  10
              ) / 10
            )
          : null;
      return {
        id: row.id,
        phone: formatWhatsAppPhone(row.phoneKey),
        clickedAt: row.clickedAt.toISOString(),
        outcome,
        adKey: row.sourceId?.trim() || "sem-anuncio",
        adLabel: adLabelOf(row),
        campaignLabel: campaignLabelOf(row),
        headline: row.headline,
        sourceUrl: row.sourceUrl,
        orderId: row.order?.id ?? null,
        orderNumber: row.order?.orderNumber ?? null,
        customerName: row.order?.recipientName ?? null,
        revenue: sold ? round2(row.order?.total ?? 0) : 0,
        hoursToSale: hours,
        reportedToMeta: Boolean(row.sentAt),
      };
    });

  const groups = new Map<string, WhatsAppAdRanking>();
  for (const item of recent) {
    const current = groups.get(item.adKey) ?? {
      adKey: item.adKey,
      adLabel: item.adLabel,
      campaignLabel: item.campaignLabel,
      headline: item.headline,
      conversations: 0,
      sales: 0,
      revenue: 0,
      conversionRate: 0,
    };
    current.conversations += 1;
    if (item.outcome === "sold") {
      current.sales += 1;
      current.revenue = round2(current.revenue + item.revenue);
    }
    groups.set(item.adKey, current);
  }

  const rankings = [...groups.values()]
    .map((group) => ({
      ...group,
      conversionRate:
        group.conversations === 0
          ? 0
          : Math.round((group.sales / group.conversations) * 1000) / 10,
    }))
    .sort((a, b) => b.revenue - a.revenue || b.sales - a.sales || b.conversations - a.conversations);

  const sales = recent.filter((item) => item.outcome === "sold");
  const revenue = round2(sales.reduce((sum, item) => sum + item.revenue, 0));
  const conversations = recent.length;
  const saleCount = sales.length;
  const hours = sales
    .map((item) => item.hoursToSale)
    .filter((value): value is number => value != null);
  const fastestHours = hours.length ? Math.min(...hours) : null;

  return {
    from: input.from,
    to: input.to,
    conversations,
    sales: saleCount,
    cancelled: recent.filter((item) => item.outcome === "cancelled").length,
    openWindow: recent.filter((item) => item.outcome === "open").length,
    expired: recent.filter((item) => item.outcome === "expired").length,
    revenue,
    conversionRate:
      conversations === 0 ? 0 : Math.round((saleCount / conversations) * 1000) / 10,
    averageTicket: saleCount === 0 ? 0 : round2(revenue / saleCount),
    revenuePerConversation:
      conversations === 0 ? 0 : round2(revenue / conversations),
    fastestHours,
    rankings,
    recent,
    insight: insightFor({
      conversations,
      rankings,
      openWindow: recent.filter((item) => item.outcome === "open").length,
      revenue,
    }),
  };
}

function insightFor(input: {
  conversations: number;
  rankings: WhatsAppAdRanking[];
  openWindow: number;
  revenue: number;
}): string {
  if (input.conversations === 0) {
    return "Nenhuma conversa de anúncio neste período. O primeiro clique que virar mensagem aparece aqui.";
  }
  const leader = input.rankings.find((item) => item.revenue > 0) ?? input.rankings[0];
  const share =
    leader && input.revenue > 0
      ? Math.round((leader.revenue / input.revenue) * 100)
      : 0;
  const waiting =
    input.openWindow > 0
      ? ` ${input.openWindow} ${input.openWindow === 1 ? "conversa ainda pode" : "conversas ainda podem"} virar venda dentro de 7 dias.`
      : "";
  if (leader && share > 0) {
    return `${leader.adLabel} trouxe ${share}% da receita deste período.${waiting}`;
  }
  if (leader) {
    return `${leader.adLabel} concentrou ${leader.conversations} ${leader.conversations === 1 ? "chamada" : "chamadas"}, ainda sem venda.${waiting}`;
  }
  return waiting.trim();
}
