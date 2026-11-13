/** Número da conversa, quando a vendedora informou; senão o telefone do pedido. */
export function whatsAppPurchasePhone(order: {
  conversationPhone?: string | null;
  phone?: string | null;
}): string {
  const conversation = order.conversationPhone?.trim() ?? "";
  if (conversation) return conversation;
  return order.phone?.trim() ?? "";
}

/** Janela em que a Meta ainda atribui o Purchase ao clique do anúncio. */
export const WHATSAPP_CLICK_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

export type WhatsAppClickCandidate = {
  id: string;
  ctwaClid: string;
  clickedAt: Date;
  status: "AVAILABLE" | "USED";
  orderId: string | null;
  sentAt: Date | null;
};

export type WhatsAppPurchaseDecision =
  | { action: "skip" }
  | { action: "claim"; click: WhatsAppClickCandidate }
  | { action: "retry"; click: WhatsAppClickCandidate };

/**
 * Um clique só cobre a primeira venda paga dentro da janela.
 * Compra posterior sem clique novo não reaproveita o ctwa_clid.
 */
export function decideWhatsAppPurchase(
  clicks: WhatsAppClickCandidate[],
  orderId: string,
  now: Date
): WhatsAppPurchaseDecision {
  const windowStart = now.getTime() - WHATSAPP_CLICK_WINDOW_MS;
  const owned = clicks.find((click) => click.orderId === orderId);
  if (owned) {
    if (owned.sentAt || owned.clickedAt.getTime() < windowStart) {
      return { action: "skip" };
    }
    return { action: "retry", click: owned };
  }

  const available = clicks
    .filter(
      (click) =>
        click.status === "AVAILABLE" &&
        click.orderId == null &&
        click.clickedAt.getTime() >= windowStart
    )
    .sort((a, b) => b.clickedAt.getTime() - a.clickedAt.getTime());

  const click = available[0];
  if (!click) return { action: "skip" };
  return { action: "claim", click };
}
