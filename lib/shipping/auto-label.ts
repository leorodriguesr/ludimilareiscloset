import { generateOrderLabel } from "@/lib/shipping/generate-order-label";
import {
  clearLabelAutoGenerateError,
  formatLabelAutoGenerateError,
  setLabelAutoGenerateError,
} from "@/lib/shipping/label-auto-generate-error";
import { ShippingQuoteError } from "@/lib/shipping/types";

/** Dispara geração automática de etiqueta após pagamento (não bloqueia webhook). */
export async function tryAutoGenerateLabelForOrder(orderId: string): Promise<void> {
  if (process.env.SUPERFRETE_AUTO_LABEL_ON_PAYMENT === "0") return;

  try {
    const result = await generateOrderLabel(orderId);
    await clearLabelAutoGenerateError(orderId);
    console.info(
      `[auto-label] pedido ${orderId}: ${result.alreadyExists ? "etiqueta já existia" : "etiqueta gerada"} (${result.shipmentId})`
    );
  } catch (e) {
    const message = formatLabelAutoGenerateError(e);
    await setLabelAutoGenerateError(orderId, message).catch((persistErr) => {
      console.error(`[auto-label] pedido ${orderId}: falha ao gravar aviso`, persistErr);
    });
    if (e instanceof ShippingQuoteError) {
      console.warn(`[auto-label] pedido ${orderId}: ${e.message}`);
    } else {
      console.error(`[auto-label] pedido ${orderId}:`, e);
    }
  }
}
