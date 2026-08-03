import { fetchSuperfreteLabelPdf } from "@/lib/shipping/label-pdf-client";
import { printSuperfreteLabel } from "@/lib/shipping/superfrete-label";
import { getMelhorEnvioAccessToken } from "@/lib/shipping/melhor-envio/auth";
import { printMelhorEnvioLabel } from "@/lib/shipping/melhor-envio/label";
import { melhorEnvioUserAgent } from "@/lib/shipping/melhor-envio/env";
import {
  isShippingProvider,
  SHIPPING_PROVIDERS,
  type ShippingProvider,
} from "@/lib/shipping/providers";
import { ShippingQuoteError } from "@/lib/shipping/types";

export { fetchSuperfreteLabelPdf, waitForLabelPdfReady } from "@/lib/shipping/label-pdf-client";

export type LabelPdfDownload = {
  pdf: ArrayBuffer;
  labelUrl: string;
  refreshed: boolean;
};

/** Quando o Melhor Envio só oferece página HTML de impressão (não PDF baixável). */
export function isLabelPrintRedirectError(
  e: unknown
): e is ShippingQuoteError & { details: { labelUrl: string; openExternally: true } } {
  if (!(e instanceof ShippingQuoteError)) return false;
  const details = e.details as { labelUrl?: string; openExternally?: boolean } | undefined;
  return Boolean(details?.openExternally && details.labelUrl);
}

function labelPrintRedirectError(labelUrl: string): ShippingQuoteError {
  return new ShippingQuoteError(
    "PARSE",
    "Etiqueta disponível na página de impressão do Melhor Envio.",
    422,
    { labelUrl, openExternally: true as const }
  );
}

async function fetchMelhorEnvioPdfBytes(labelUrl: string): Promise<ArrayBuffer> {
  const token = await getMelhorEnvioAccessToken();
  const res = await fetch(labelUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      "User-Agent": melhorEnvioUserAgent(),
      Accept: "application/pdf,*/*",
    },
    cache: "no-store",
  });
  if (!res.ok) {
    throw new ShippingQuoteError(
      "UPSTREAM",
      "Link da etiqueta inválido ou expirado.",
      res.status
    );
  }
  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("html")) {
    throw labelPrintRedirectError(labelUrl);
  }
  if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
    throw new ShippingQuoteError("PARSE", "Resposta não é um PDF válido.", 503);
  }
  return res.arrayBuffer();
}

async function downloadMelhorEnvioLabelPdf(
  shipmentId: string,
  storedLabelUrl?: string | null
): Promise<LabelPdfDownload> {
  const stored = storedLabelUrl?.trim();
  if (stored) {
    try {
      const pdf = await fetchMelhorEnvioPdfBytes(stored);
      return { pdf, labelUrl: stored, refreshed: false };
    } catch (e) {
      if (isLabelPrintRedirectError(e)) throw e;
      // URL privada expirada — gera link novo abaixo
    }
  }

  // private costuma devolver PDF; public devolve página HTML de impressão.
  try {
    const privateUrl = await printMelhorEnvioLabel(shipmentId, "private");
    const pdf = await fetchMelhorEnvioPdfBytes(privateUrl);
    return { pdf, labelUrl: privateUrl, refreshed: true };
  } catch (e) {
    if (isLabelPrintRedirectError(e)) throw e;
    console.warn(
      "[downloadLabelPdf] Melhor Envio private falhou, tentando public:",
      e instanceof Error ? e.message : e
    );
  }

  const publicUrl = await printMelhorEnvioLabel(shipmentId, "public");
  throw labelPrintRedirectError(publicUrl);
}

/**
 * Baixa o PDF da etiqueta. Se a URL gravada expirou, solicita nova via print.
 * Melhor Envio pode exigir redirect para a página pública de impressão.
 */
export async function downloadLabelPdfForShipment(
  shipmentId: string,
  storedLabelUrl?: string | null,
  providerInput?: string | null
): Promise<LabelPdfDownload> {
  const provider: ShippingProvider = isShippingProvider(providerInput)
    ? providerInput
    : SHIPPING_PROVIDERS.SUPERFRETE;

  if (provider === SHIPPING_PROVIDERS.MELHOR_ENVIO) {
    return downloadMelhorEnvioLabelPdf(shipmentId, storedLabelUrl);
  }

  const stored = storedLabelUrl?.trim();
  if (stored) {
    try {
      const pdf = await fetchSuperfreteLabelPdf(stored);
      return { pdf, labelUrl: stored, refreshed: false };
    } catch {
      // URL expirada — gera link novo abaixo
    }
  }

  const labelUrl = await printSuperfreteLabel(shipmentId);
  const pdf = await fetchSuperfreteLabelPdf(labelUrl);
  return { pdf, labelUrl, refreshed: true };
}
