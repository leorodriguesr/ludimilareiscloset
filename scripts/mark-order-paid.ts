/**
 * Marca pedido como pago (dev/admin manual).
 * Uso: npm run db:mark-paid -- 3
 *      npm run db:mark-paid -- cmqivi6cu00000s46wnxbtz3z
 *      npm run db:mark-paid -- 3 --unpay
 */
import { prisma } from "../lib/prisma";

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

  if (unpay) {
    await prisma.order.update({
      where: { id: order.id },
      data: { status: "pending_payment", paidAt: null },
    });
    console.log(`Pedido #${order.orderNumber ?? order.id} → aguardando pagamento`);
    return;
  }

  await prisma.order.update({
    where: { id: order.id },
    data: { status: "paid", paidAt: new Date() },
  });

  console.log(`Pedido #${order.orderNumber ?? order.id} → pago (paidAt=${new Date().toISOString()})`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => void prisma.$disconnect());
