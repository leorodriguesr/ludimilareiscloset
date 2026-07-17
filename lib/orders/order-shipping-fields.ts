import { prisma } from "@/lib/prisma";
import { getPackagingDays } from "@/lib/shipping/packaging-days";

export type OrderShippingFieldsRow = {
  id: string;
  shippingServiceId: number | null;
  superfreteStatus: string | null;
  trackingCode: string | null;
  labelGeneratedAt: string | null;
  labelAutoGenerateError: string | null;
  shippingQuotedPrice: number | null;
  shippingDeliveryDaysMin: number | null;
  shippingDeliveryDaysMax: number | null;
  superfreteShippingPrice: number | null;
};

function toPrice(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function toInt(value: unknown): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : null;
}

/** Campos de envio — leitura direta do SQLite (evita client Prisma desatualizado em hot reload). */
export async function fetchOrderShippingFieldsByIds(
  ids: string[]
): Promise<Map<string, OrderShippingFieldsRow>> {
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<
    Array<{
      id: string;
      shippingServiceId: number | null;
      superfreteStatus: string | null;
      trackingCode: string | null;
      labelGeneratedAt: string | null;
      labelAutoGenerateError: string | null;
      shippingQuotedPrice: number | null;
      shippingDeliveryDaysMin: number | null;
      shippingDeliveryDaysMax: number | null;
      superfreteShippingPrice: number | null;
    }>
  >(
    `SELECT
      id,
      "shippingServiceId",
      "superfreteStatus",
      "trackingCode",
      "labelGeneratedAt",
      "labelAutoGenerateError",
      "shippingQuotedPrice",
      "shippingDeliveryDaysMin",
      "shippingDeliveryDaysMax",
      "superfreteShippingPrice"
    FROM "Order"
    WHERE id IN (${placeholders})`,
    ...ids
  );

  return new Map(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        shippingServiceId: toInt(row.shippingServiceId),
        superfreteStatus: row.superfreteStatus,
        trackingCode: row.trackingCode,
        labelGeneratedAt: row.labelGeneratedAt,
        labelAutoGenerateError: row.labelAutoGenerateError,
        shippingQuotedPrice: toPrice(row.shippingQuotedPrice),
        shippingDeliveryDaysMin: toInt(row.shippingDeliveryDaysMin),
        shippingDeliveryDaysMax: toInt(row.shippingDeliveryDaysMax),
        superfreteShippingPrice: toPrice(row.superfreteShippingPrice),
      },
    ])
  );
}

export function mergeOrderShippingFields<T extends { id: string }>(
  orders: T[],
  byId: Map<string, OrderShippingFieldsRow>
): Array<T & Partial<OrderShippingFieldsRow>> {
  return orders.map((order) => {
    const extra = byId.get(order.id);
    return extra ? { ...order, ...extra } : order;
  });
}

export async function updateOrderSuperfreteShippingPrice(
  orderId: string,
  price: number
): Promise<void> {
  const rounded = Math.round(price * 100) / 100;
  await prisma.$executeRawUnsafe(
    `UPDATE "Order" SET "superfreteShippingPrice" = ?, "updatedAt" = datetime('now') WHERE id = ?`,
    rounded,
    orderId
  );
}

export async function updateOrderDeliveryDaysFromSuperfrete(
  orderId: string,
  min: number | null,
  max: number | null
): Promise<void> {
  const extra = await getPackagingDays();
  const withPack = (n: number | null) => {
    if (n == null || n < 0) return null;
    const base = Math.floor(n);
    return base > 0 ? base + extra : base;
  };
  await prisma.$executeRawUnsafe(
    `UPDATE "Order" SET
      "shippingDeliveryDaysMin" = ?,
      "shippingDeliveryDaysMax" = ?,
      "updatedAt" = datetime('now')
    WHERE id = ?`,
    withPack(min),
    withPack(max),
    orderId
  );
}
