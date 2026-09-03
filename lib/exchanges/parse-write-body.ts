import type {
  ExchangeKind,
  ExchangeReason,
  ExchangeShippingMethod,
  ExchangeShippingPaidBy,
  ExchangeShippingType,
} from "@/app/generated/prisma/client";
import type { CreateExchangeInput } from "@/lib/exchanges/create-exchange";

export function parseExchangeWriteBody(
  b: Record<string, unknown>
): Omit<
  CreateExchangeInput,
  "openedByUserId" | "bypassExchangeWindow" | "replaceExchangeId"
> {
  const returnLines = Array.isArray(b.returnLines)
    ? b.returnLines.map((row) => {
        const r = row as Record<string, unknown>;
        return {
          orderItemId: String(r.orderItemId ?? ""),
          quantity: Math.floor(Number(r.quantity)),
          creditAmount:
            r.creditAmount == null || r.creditAmount === ""
              ? null
              : Number(r.creditAmount),
          pieceSelections: Array.isArray(r.pieceSelections)
            ? r.pieceSelections
                .map((row) => {
                  if (!row || typeof row !== "object") return null;
                  const p = row as Record<string, unknown>;
                  if (typeof p.pieceName !== "string") return null;
                  return {
                    pieceName: p.pieceName,
                    size: typeof p.size === "string" ? p.size : null,
                    color: typeof p.color === "string" ? p.color : null,
                  };
                })
                .filter(
                  (x): x is {
                    pieceName: string;
                    size: string | null;
                    color: string | null;
                  } => x != null
                )
            : undefined,
        };
      })
    : [];

  const outboundLines = Array.isArray(b.outboundLines)
    ? b.outboundLines.map((row) => {
        const r = row as Record<string, unknown>;
        const quantity = Math.floor(Number(r.quantity));
        if (r.kind === "custom") {
          return {
            kind: "custom" as const,
            description: String(r.description ?? ""),
            quantity,
            unitPrice: Number(r.unitPrice ?? 0),
            lineRole:
              r.lineRole === "ADDITIONAL_SALE"
                ? ("ADDITIONAL_SALE" as const)
                : ("REPLACEMENT" as const),
            pieces: Array.isArray(r.pieces)
              ? (r.pieces as {
                  name: string;
                  size: string;
                  color: string;
                }[])
              : undefined,
          };
        }
        return {
          kind: "catalog" as const,
          productId: String(r.productId ?? ""),
          quantity,
          unitPrice: r.unitPrice != null ? Number(r.unitPrice) : undefined,
          lineRole:
            r.lineRole === "ADDITIONAL_SALE"
              ? ("ADDITIONAL_SALE" as const)
              : ("REPLACEMENT" as const),
          pieceSelections: Array.isArray(r.pieceSelections)
            ? (r.pieceSelections as {
                pieceName: string;
                size: string | null;
                color: string | null;
              }[])
            : undefined,
        };
      })
    : [];

  const shippings = Array.isArray(b.shippings)
    ? b.shippings.map((row) => {
        const r = row as Record<string, unknown>;
        const methodRaw = r.method;
        const method: ExchangeShippingMethod =
          methodRaw === "STORE_PICKUP" ||
          methodRaw === "LOCAL_COURIER" ||
          methodRaw === "CARRIER"
            ? methodRaw
            : "CARRIER";
        return {
          type: r.type as ExchangeShippingType,
          method,
          shippingServiceId:
            r.shippingServiceId != null ? Number(r.shippingServiceId) : null,
          shippingServiceName:
            typeof r.shippingServiceName === "string"
              ? r.shippingServiceName
              : null,
          quotedPrice: r.quotedPrice != null ? Number(r.quotedPrice) : null,
          paidBy: (r.paidBy as ExchangeShippingPaidBy) ?? "STORE",
          packageHeightCm:
            r.packageHeightCm != null ? Number(r.packageHeightCm) : null,
          packageWidthCm:
            r.packageWidthCm != null ? Number(r.packageWidthCm) : null,
          packageLengthCm:
            r.packageLengthCm != null ? Number(r.packageLengthCm) : null,
          packageWeightKg:
            r.packageWeightKg != null ? Number(r.packageWeightKg) : null,
        };
      })
    : [];

  const kind: ExchangeKind = b.kind === "RETURN" ? "RETURN" : "EXCHANGE";
  const refundRaw = b.refundAmount;
  const refundAmount =
    refundRaw == null || refundRaw === "" ? null : Number(refundRaw);

  return {
    orderId: String(b.orderId ?? ""),
    kind,
    reason: b.reason as ExchangeReason,
    reasonNotes: typeof b.reasonNotes === "string" ? b.reasonNotes : null,
    notes: typeof b.notes === "string" ? b.notes : null,
    returnLines,
    outboundLines: kind === "RETURN" ? [] : outboundLines,
    shippings,
    refundAmount,
  };
}
