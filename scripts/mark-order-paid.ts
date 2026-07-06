/**
 * Marca pedido como pago (dev/admin manual) e dispara geração automática de etiqueta.
 * Uso: npm run db:mark-paid -- 3
 *      npm run db:mark-paid -- cmqivi6cu00000s46wnxbtz3z
 *      npm run db:mark-paid -- 3 --unpay
 */
import { prisma } from "../lib/prisma";
import { commitStockReservations } from "../lib/orders/stock/reservation";
import { tryAutoGenerateLabelForOrder } from "../lib/shipping/auto-label";
import { ORDER_STATUS } from "../lib/orders/constants";

async function main() {
  const arg = process.argv[2];
  const unpay = process.argv.includes("--unpay");

  if (!arg?.trim()) {
    console.error("Informe o orderNumber ou id do pedido.");
    console.error("Ex.: npm run db:mark-paid -- 3");
    process.exit(1);
  }

  const asNumber = Number(arg);
  const order = await prisma.order.findFirst({
    where: Number.isFinite(asNumber)
      ? { orderNumber: Math.floor(asNumber) }
      : { id: arg.trim() },
    select: {
      id: true,
      orderNumber: true,
      status: true,
      paidAt: true,
    },
  });

  if (!order) {
    console.error(`Pedido não encontrado: ${arg}`);
    process.exit(1);
  }

  const label = `#${order.orderNumber ?? order.id}`;

  if (unpay) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "pending_payment", paidAt: null },
    });
    console.log(`Pedido ${label} → aguardando pagamento`);
    return;
  }

  if (order.status !== "paid" || !order.paidAt) {
    await prisma.$transaction(async (tx) => {
      await tx.order.update({
        where: { id: order.id },
        data: { status: ORDER_STATUS.PAID, paidAt: new Date() },
      });
      await commitStockReservations(tx, order.id);
    });
    console.log(`Pedido ${label} → pago`);
  } else {
    console.log(`Pedido ${label} já estava pago. Tentando gerar etiqueta…`);
  }

  console.log("Gerando etiqueta automaticamente (SuperFrete)…");
  await tryAutoGenerateLabelForOrder(order.id);

  const rows = await prisma.$queryRawUnsafe<
    Array<{ labelAutoGenerateError: string | null; superfreteShipmentId: string | null }>
  >(
    `SELECT "labelAutoGenerateError", "superfreteShipmentId" FROM "Order" WHERE id = ?`,
    order.id
  );
  const row = rows[0];

  if (row?.labelAutoGenerateError) {
    console.warn(`Aviso: ${row.labelAutoGenerateError}`);
  } else if (row?.superfreteShipmentId) {
    console.log(`Etiqueta gerada (SuperFrete ${row.superfreteShipmentId}).`);
  } else {
    console.log("Pedido pago. Etiqueta ainda pendente — verifique logs.");
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
