import { readSuperFreteClientConfig } from "@/lib/shipping/superfrete-client";
import { ShippingQuoteError } from "@/lib/shipping/types";

const PDF_RETRY_ATTEMPTS = 10;
const PDF_RETRY_DELAY_MS = 1200;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchSuperfreteLabelPdfOnce(labelUrl: string): Promise<ArrayBuffer> {
  const cfg = readSuperFreteClientConfig();

  const res = await fetch(labelUrl, {
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "User-Agent": cfg.userAgent,
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
  if (!contentType.includes("pdf") && !contentType.includes("octet-stream")) {
    // Pode acontecer em produção quando o PDF ainda está sendo processado
    throw new ShippingQuoteError(
      "PARSE",
      "Resposta da SuperFrete não é um PDF válido.",
      503
    );
  }

  return res.arrayBuffer();
}

/**
 * Após checkout, a SuperFrete pode levar ~1s para disponibilizar o PDF (500 temporário).
 */
export async function fetchSuperfreteLabelPdf(labelUrl: string): Promise<ArrayBuffer> {
  let lastError: ShippingQuoteError | null = null;

  for (let attempt = 1; attempt <= PDF_RETRY_ATTEMPTS; attempt++) {
    try {
      return await fetchSuperfreteLabelPdfOnce(labelUrl);
    } catch (e) {
      if (!(e instanceof ShippingQuoteError)) throw e;
      lastError = e;
      // 404/500-503: PDF ainda não processado pela SuperFrete em produção
      const retryable = e.status === 404 || e.status === 500 || e.status === 502 || e.status === 503;
      if (!retryable || attempt >= PDF_RETRY_ATTEMPTS) break;
      await sleep(PDF_RETRY_DELAY_MS);
    }
  }

  throw (
    lastError ??
    new ShippingQuoteError("UPSTREAM", "Não foi possível baixar a etiqueta.", 502)
  );
}

export async function waitForLabelPdfReady(labelUrl: string): Promise<void> {
  await fetchSuperfreteLabelPdf(labelUrl);
}
