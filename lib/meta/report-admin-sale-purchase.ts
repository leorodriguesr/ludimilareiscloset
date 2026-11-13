import { OrderSource } from "@/app/generated/prisma/client";
import { sendWhatsAppPurchase } from "@/lib/meta/capi";
import { brPhoneKeys } from "@/lib/meta/phone-keys";
import {
  decideWhatsAppPurchase,
  whatsAppPurchasePhone,
} from "@/lib/meta/purchase-match";
import { ORDER_STATUS } from "@/lib/orders/constants";
import { prisma } from "@/lib/prisma";

/**
 * Envia um Purchase da venda avulsa para a Meta, se houver clique de anúncio
 * ainda disponível para o telefone. Não altera o resultado do pagamento.
 */
export async function reportAdminSalePurchaseToMeta(orderId: string): Promise<void> {
  try {
    const order = await prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        orderSource: true,
        status: true,
        phone: true,
        conversationPhone: true,
        total: true,
        paidAt: true,
      },
    });
    if (!order || order.orderSource !== OrderSource.ADMIN_SALE) return;
    if (order.status !== ORDER_STATUS.PAID || !order.paidAt) return;
    if (!(order.total > 0)) return;

    const keys = brPhoneKeys(whatsAppPurchasePhone(order));
    if (keys.length === 0) return;

    const clicks = await prisma.whatsAppAdClick.findMany({
      where: {
        OR: [{ phoneKey: { in: keys } }, { phoneKeyAlt: { in: keys } }],
      },
      select: {
        id: true,
        ctwaClid: true,
        clickedAt: true,
        status: true,
        orderId: true,
        sentAt: true,
      },
    });

    const decision = decideWhatsAppPurchase(clicks, order.id, new Date());
    if (decision.action === "skip") return;

    if (decision.action === "claim") {
      const claimed = await prisma.whatsAppAdClick.updateMany({
        where: {
          id: decision.click.id,
          status: "AVAILABLE",
          orderId: null,
        },
        data: {
          status: "USED",
          orderId: order.id,
          usedAt: new Date(),
        },
      });
      if (claimed.count !== 1) return;
    }

    const result = await sendWhatsAppPurchase({
      ctwaClid: decision.click.ctwaClid,
      eventId: `wa-purchase-${order.id}`,
      eventTime: new Date(),
      value: order.total,
    });

    if (result.ok) {
      await prisma.whatsAppAdClick.update({
        where: { id: decision.click.id },
        data: { sentAt: new Date(), lastError: null },
      });
      return;
    }

    await prisma.whatsAppAdClick.update({
      where: { id: decision.click.id },
      data: { lastError: result.error.slice(0, 500) },
    });
    console.error("[meta purchase]", order.id, result.error);
  } catch (error) {
    console.error("[meta purchase]", orderId, error);
  }
}
