import { prisma } from "@/lib/prisma";
import {
  parseDashboardDateRange,
  type DashboardDateRange,
} from "@/lib/admin/dashboard-metrics";
import {
  buildWhatsAppAdReport,
  type WhatsAppAdClickRow,
  type WhatsAppAdReport,
} from "@/lib/admin/whatsapp-ad-report";

function rangeBounds(range: DashboardDateRange): { gte: Date; lte: Date } {
  return {
    gte: new Date(`${range.from}T00:00:00.000-03:00`),
    lte: new Date(`${range.to}T23:59:59.999-03:00`),
  };
}

type GraphAd = {
  name?: string;
  adset?: { name?: string };
  campaign?: { id?: string; name?: string };
};

async function rememberAdNames(sourceIds: string[]): Promise<void> {
  const token = process.env.META_SYSTEM_USER_TOKEN?.trim();
  if (!token || sourceIds.length === 0) return;
  const version = process.env.META_GRAPH_API_VERSION?.trim() || "v23.0";

  await Promise.all(
    sourceIds.slice(0, 20).map(async (sourceId) => {
      try {
        const response = await fetch(
          `https://graph.facebook.com/${version}/${sourceId}?fields=name,adset{name},campaign{id,name}`,
          { headers: { Authorization: `Bearer ${token}` } }
        );
        if (!response.ok) return;
        const data = (await response.json()) as GraphAd;
        if (!data.name && !data.campaign?.name) return;
        await prisma.whatsAppAdClick.updateMany({
          where: { sourceId, adName: null },
          data: {
            adName: data.name ?? null,
            adsetName: data.adset?.name ?? null,
            campaignId: data.campaign?.id ?? null,
            campaignName: data.campaign?.name ?? null,
          },
        });
      } catch (error) {
        console.error("[whatsapp ads] nome do anúncio", sourceId, error);
      }
    })
  );
}

export async function loadWhatsAppAdReport(
  from: string | null,
  to: string | null
): Promise<WhatsAppAdReport> {
  const range = parseDashboardDateRange(from, to);
  const bounds = rangeBounds(range);
  const rows = await prisma.whatsAppAdClick.findMany({
    where: { clickedAt: { gte: bounds.gte, lte: bounds.lte } },
    select: {
      id: true,
      phoneKey: true,
      clickedAt: true,
      sourceId: true,
      sourceUrl: true,
      headline: true,
      bodyText: true,
      adName: true,
      adsetName: true,
      campaignId: true,
      campaignName: true,
      status: true,
      sentAt: true,
      order: {
        select: {
          id: true,
          orderNumber: true,
          total: true,
          paidAt: true,
          status: true,
          recipientName: true,
        },
      },
    },
  });

  const missingNames = [
    ...new Set(
      rows
        .filter((row) => row.sourceId && !row.adName)
        .map((row) => row.sourceId as string)
    ),
  ];
  if (missingNames.length > 0) {
    await rememberAdNames(missingNames);
    const named = await prisma.whatsAppAdClick.findMany({
      where: { sourceId: { in: missingNames }, adName: { not: null } },
      select: {
        sourceId: true,
        adName: true,
        adsetName: true,
        campaignId: true,
        campaignName: true,
      },
    });
    const bySource = new Map(named.map((row) => [row.sourceId, row]));
    for (const row of rows) {
      const match = row.sourceId ? bySource.get(row.sourceId) : undefined;
      if (!match) continue;
      row.adName = match.adName;
      row.adsetName = match.adsetName;
      row.campaignId = match.campaignId;
      row.campaignName = match.campaignName;
    }
  }

  return buildWhatsAppAdReport({
    from: range.from,
    to: range.to,
    now: new Date(),
    rows: rows as WhatsAppAdClickRow[],
  });
}
