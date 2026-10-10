import assert from "node:assert/strict";
import test from "node:test";
import { StockType } from "@/app/generated/prisma/client";
import { OrderCreateError } from "@/lib/orders/create-order";
import { reserveStockForOrderLines } from "@/lib/orders/stock/reservation";

function fakeTx(input: { stock: number; allowBackorder: boolean; days?: number }) {
  const created: Array<Record<string, unknown>> = [];
  return {
    created,
    tx: {
      product: {
        findUnique: async () => ({
          id: "product-1",
          name: "Vestido",
          stockType: StockType.LIMITED,
          stockQuantity: input.stock,
          allowBackorder: input.allowBackorder,
          restockLeadDays: input.days ?? null,
          pieces: [],
        }),
      },
      pieceVariant: {
        findUnique: async () => null,
      },
      stockReservation: {
        aggregate: async () => ({ _sum: { quantity: 0 } }),
        createMany: async ({ data }: { data: Array<Record<string, unknown>> }) => {
          created.push(...data);
          return { count: data.length };
        },
      },
      $executeRawUnsafe: async () => 0,
    },
  };
}

test("aloca estoque físico primeiro e registra somente a falta como reposição", async () => {
  const fake = fakeTx({ stock: 2, allowBackorder: true, days: 4 });
  const [allocation] = await reserveStockForOrderLines(
    fake.tx as never,
    "order-1",
    [{ productId: "product-1", quantity: 5, price: 100 }],
    new Date(),
    { acceptBackorder: true }
  );

  assert.equal(allocation?.stockAllocatedQuantity, 2);
  assert.equal(allocation?.backorderQuantity, 3);
  assert.equal(allocation?.restockLeadDays, 4);
  assert.equal(fake.created[0]?.quantity, 2);
});

test("exige confirmação para entrega local com reposição", async () => {
  const fake = fakeTx({ stock: 0, allowBackorder: true, days: 3 });
  await assert.rejects(
    reserveStockForOrderLines(
      fake.tx as never,
      "order-1",
      [{ productId: "product-1", quantity: 1, price: 100 }]
    ),
    (error: unknown) =>
      error instanceof OrderCreateError &&
      error.code === "BACKORDER_CONFIRMATION_REQUIRED"
  );
});

test("produto sem venda sob encomenda continua bloqueando falta de estoque", async () => {
  const fake = fakeTx({ stock: 0, allowBackorder: false });
  await assert.rejects(
    reserveStockForOrderLines(
      fake.tx as never,
      "order-1",
      [{ productId: "product-1", quantity: 1, price: 100 }],
      new Date(),
      { acceptBackorder: true }
    ),
    (error: unknown) =>
      error instanceof OrderCreateError && error.code === "INSUFFICIENT_STOCK"
  );
});
