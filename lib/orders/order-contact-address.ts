import { prisma } from "@/lib/prisma";

export type OrderContactAddressRow = {
  id: string;
  orderNumber: number | null;
  recipientName: string | null;
  phone: string | null;
  cpf: string | null;
  destinationCep: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
};

/** Lê contato/endereço direto do SQLite — evita client Prisma desatualizado em hot reload. */
export async function fetchOrderContactAddressByIds(
  ids: string[]
): Promise<Map<string, OrderContactAddressRow>> {
  if (!ids.length) return new Map();

  const placeholders = ids.map(() => "?").join(",");
  const rows = await prisma.$queryRawUnsafe<OrderContactAddressRow[]>(
    `SELECT
      id,
      "orderNumber",
      "recipientName",
      phone,
      cpf,
      "destinationCep",
      "addressStreet",
      "addressNumber",
      "addressComplement",
      "addressNeighborhood",
      "addressCity",
      "addressState"
    FROM "Order"
    WHERE id IN (${placeholders})`,
    ...ids
  );

  return new Map(rows.map((row) => [row.id, row]));
}

export function mergeOrderContactAddress<T extends { id: string }>(
  orders: T[],
  byId: Map<string, OrderContactAddressRow>
): Array<T & Partial<OrderContactAddressRow>> {
  return orders.map((order) => {
    const extra = byId.get(order.id);
    return extra ? { ...order, ...extra } : order;
  });
}
