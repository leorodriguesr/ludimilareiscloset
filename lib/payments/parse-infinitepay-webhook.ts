/**
 * Extrai campos do webhook InfinitePay mesmo quando o JSON vem aninhado
 * ou com chaves em outros formatos.
 */
export type ParsedInfinitePayWebhook = {
  orderNsu: string;
  transactionNsu: string;
  invoiceSlug: string;
  captureMethod: string;
};

export function parseInfinitePayWebhookPayload(
  raw: unknown
): ParsedInfinitePayWebhook | null {
  let orderNsu = "";
  let transactionNsu = "";
  let invoiceSlug = "";
  let captureMethod = "";

  function visit(node: unknown, depth: number): void {
    if (node === null || node === undefined) return;
    if (typeof node === "string") {
      const t = node.trim();
      if (
        (t.startsWith("{") && t.endsWith("}")) ||
        (t.startsWith("[") && t.endsWith("]"))
      ) {
        try {
          visit(JSON.parse(t), depth + 1);
        } catch {
          /* ignore */
        }
      }
      return;
    }
    if (typeof node !== "object") return;
    if (Array.isArray(node)) {
      for (const item of node) visit(item, depth + 1);
      return;
    }
    const o = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(o)) {
      const kl = k.toLowerCase().replace(/-/g, "_");
      const scalar =
        typeof v === "string"
          ? v.trim()
          : typeof v === "number" && Number.isFinite(v)
            ? String(v)
          : "";
      if (scalar !== "") {
        const s = scalar;
        if (kl === "order_nsu") orderNsu ||= s;
        else if (kl === "order_id") orderNsu ||= s;
        else if (kl === "client_reference") orderNsu ||= s;
        else if (kl === "transaction_nsu") transactionNsu ||= s;
        else if (kl === "transaction_id") transactionNsu ||= s;
        else if (kl === "tid") transactionNsu ||= s;
        else if (kl === "nsu" && depth <= 4) transactionNsu ||= s;
        else if (kl === "invoice_slug") invoiceSlug ||= s;
        else if (kl === "slug" && depth <= 2) invoiceSlug ||= s;
        else if (kl === "lenc") invoiceSlug ||= s;
        else if (kl === "capture_method") captureMethod ||= s;
      }
      visit(v, depth + 1);
    }
  }

  visit(raw, 0);

  /** Precisa de pelo menos um identificador para localizar o pedido no banco. */
  if (!orderNsu.trim() && !invoiceSlug.trim()) return null;

  return {
    orderNsu,
    transactionNsu,
    invoiceSlug,
    captureMethod,
  };
}
