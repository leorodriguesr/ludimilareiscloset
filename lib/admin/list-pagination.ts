import type { Prisma } from "@/app/generated/prisma/client";

export const ADMIN_LIST_PAGE_SIZE = 50;
export const ADMIN_LIST_MAX_PAGE_SIZE = 200;

export function parseAdminListPage(raw: string | null): number {
  return Math.max(1, Number(raw ?? 1) || 1);
}

export function parseAdminListLimit(raw: string | null): number {
  const parsed = Number(raw ?? ADMIN_LIST_PAGE_SIZE) || ADMIN_LIST_PAGE_SIZE;
  return Math.min(ADMIN_LIST_MAX_PAGE_SIZE, Math.max(1, parsed));
}

/**
 * Recorte de período da lista de vendas.
 * Pagas / por embalar: data do pagamento.
 * Aguardando: data de criação.
 * Canceladas: data do cancelamento/expiração (criação se não houver).
 * Sem filtro de status: qualquer um desses eventos no intervalo.
 */
export function saleListDateWhere(
  from: string | null,
  to: string | null,
  statusFilter: string | null
): Prisma.OrderWhereInput {
  if (!from && !to) return {};
  const start = from || to || "";
  const end = to || from || "";
  const range = saoPauloDayRange(start, end);
  if (!range) return {};

  if (statusFilter === "paid" || statusFilter === "to_pack") {
    return { paidAt: range };
  }
  if (statusFilter === "waiting") {
    return { createdAt: range };
  }
  if (statusFilter === "cancelled") {
    return {
      OR: [
        { cancelledAt: range },
        { expiredAt: range },
        {
          AND: [
            { cancelledAt: null },
            { expiredAt: null },
            { createdAt: range },
          ],
        },
      ],
    };
  }

  return {
    OR: [
      { paidAt: range },
      { createdAt: range },
      { cancelledAt: range },
      { expiredAt: range },
    ],
  };
}

/** Início/fim do dia em America/São Paulo (sem horário de verão desde 2019). */
export function saoPauloDayRange(from: string, to: string): {
  gte: Date;
  lte: Date;
} | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return null;
  }
  const start = new Date(`${from}T00:00:00.000-03:00`);
  const end = new Date(`${to}T23:59:59.999-03:00`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return null;
  return start <= end ? { gte: start, lte: end } : { gte: end, lte: start };
}

export function searchDigits(query: string): number | null {
  const digits = query.replace(/\D/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export function clampAdminListPage(page: number, total: number, limit: number): number {
  const pageCount = Math.max(1, Math.ceil(total / limit));
  return Math.min(page, pageCount);
}
