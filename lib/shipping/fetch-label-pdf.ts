import { fetchSuperfreteLabelPdf } from "@/lib/shipping/label-pdf-client";
import { printSuperfreteLabel } from "@/lib/shipping/superfrete-label";

export { fetchSuperfreteLabelPdf, waitForLabelPdfReady } from "@/lib/shipping/label-pdf-client";

export type LabelPdfDownload = {
  pdf: ArrayBuffer;
  labelUrl: string;
  refreshed: boolean;
};

/**
 * Baixa o PDF da etiqueta. Se a URL gravada expirou, solicita nova via tag/print.
 */
export async function downloadLabelPdfForShipment(
  shipmentId: string,
  storedLabelUrl?: string | null
): Promise<LabelPdfDownload> {
  const stored = storedLabelUrl?.trim();
  if (stored) {
    try {
      const pdf = await fetchSuperfreteLabelPdf(stored);
      return { pdf, labelUrl: stored, refreshed: false };
    } catch {
      // URL expirada ou indisponível — gera link novo abaixo
    }
  }

  const labelUrl = await printSuperfreteLabel(shipmentId);
  const pdf = await fetchSuperfreteLabelPdf(labelUrl);
  return { pdf, labelUrl, refreshed: true };
}
