import { parseShippingOptionId } from "@/lib/shipping/providers";

/** Converte optionId da loja (ex.: "sf:3" | "me:3") em serviceId numérico. */
export function parseSuperfreteServiceId(optionId: string): number | null {
  return parseShippingOptionId(optionId).serviceId;
}

/** Infere serviceId a partir do rótulo salvo no pedido (ex.: "jadlog — JADLOG Econômico"). */
export function resolveShippingServiceIdFromName(
  serviceName: string | null | undefined
): number | null {
  if (!serviceName?.trim()) return null;
  const text = serviceName.toLowerCase();
  if (/\bmini\s*envio/.test(text)) return 17;
  if (/\bsedex\b/.test(text)) return 2;
  if (/\bjadlog\b/.test(text)) return 3;
  if (/\bloggi\b/.test(text)) return 31;
  if (/\bpac\b/.test(text)) return 1;
  return null;
}

export function resolveOrderShippingServiceId(input: {
  shippingServiceId: number | null;
  shippingServiceName: string | null;
  shippingOptionId?: string | null;
}): number | null {
  if (input.shippingServiceId != null && input.shippingServiceId > 0) {
    return input.shippingServiceId;
  }
  if (input.shippingOptionId) {
    const fromOption = parseSuperfreteServiceId(input.shippingOptionId);
    if (fromOption != null) return fromOption;
  }
  return resolveShippingServiceIdFromName(input.shippingServiceName);
}

export function superfreteOptionId(serviceId: number): string {
  return `sf:${serviceId}`;
}

/** Jadlog (3) e Loggi (31) exigem declaração de conteúdo na SuperFrete. */
export function requiresContentDeclaration(serviceId: number): boolean {
  return serviceId === 3 || serviceId === 31;
}

export const SUPERFRETE_STATUS_LABELS: Record<string, string> = {
  pending: "Aguardando pagamento",
  released: "Etiqueta paga — aguardando postagem",
  generated: "Etiqueta gerada — aguardando postagem",
  posted: "Postado",
  delivered: "Entregue",
  cancelled: "Cancelado",
  canceled: "Cancelado",
  undelivered: "Não entregue",
  paused: "Pausado",
  suspended: "Suspenso",
};

/** Melhor Envio usa `canceled`; internamente gravamos `cancelled`. */
export function normalizeProviderShipmentStatus(
  status: string | null | undefined
): string {
  const raw = (status ?? "").trim().toLowerCase();
  if (!raw) return "unknown";
  if (raw === "canceled" || raw === "cancelled") return "cancelled";
  if (raw === "not delivered" || raw === "not_delivered") return "undelivered";
  if (raw === "entregue" || raw === "delivered") return "delivered";
  return raw;
}

export function isCancelledProviderShipmentStatus(
  status: string | null | undefined
): boolean {
  return normalizeProviderShipmentStatus(status) === "cancelled";
}

function hasProviderTimestamp(value: unknown): boolean {
  if (value == null) return false;
  const text = String(value).trim();
  return text !== "" && text.toLowerCase() !== "null";
}

/** Status a partir do payload (inclui `canceled_at` do Melhor Envio). */
export function providerShipmentStatusFromPayload(payload: {
  status?: unknown;
  canceled_at?: unknown;
  cancelled_at?: unknown;
  delivered_at?: unknown;
}): string {
  if (
    hasProviderTimestamp(payload.canceled_at) ||
    hasProviderTimestamp(payload.cancelled_at)
  ) {
    return "cancelled";
  }
  if (hasProviderTimestamp(payload.delivered_at)) {
    return "delivered";
  }
  return normalizeProviderShipmentStatus(
    typeof payload.status === "string" ? payload.status : undefined
  );
}

const PROVIDER_STATUS_RANK: Record<string, number> = {
  pending: 1,
  released: 2,
  generated: 2,
  paused: 2,
  suspended: 2,
  posted: 3,
  undelivered: 3,
  delivered: 4,
  cancelled: 10,
};

/** Escolhe o status mais avançado entre várias fontes (webhook event + payload, tracking + GET). */
export function coalesceProviderShipmentStatus(
  ...values: Array<string | null | undefined>
): string {
  let best = "unknown";
  let bestRank = -1;
  for (const value of values) {
    const normalized = normalizeProviderShipmentStatus(value);
    if (normalized === "unknown") continue;
    const rank = PROVIDER_STATUS_RANK[normalized] ?? 0;
    if (rank >= bestRank) {
      best = normalized;
      bestRank = rank;
    }
  }
  return best;
}

const SHIPPING_STATUS_RANK: Record<string, number> = {
  to_pack: 0,
  packed: 1,
  shipped: 2,
  delivered: 3,
};

/**
 * Evita rebaixar um pedido já entregue quando o provedor reenvia `posted`.
 * Cancelamento sempre aplica.
 */
export function mergeShippingStatusFromProvider(
  current: string | null | undefined,
  mapped: "to_pack" | "packed" | "shipped" | "delivered" | "cancelled" | null
): "to_pack" | "packed" | "shipped" | "delivered" | "cancelled" | null {
  if (!mapped) return null;
  if (mapped === "cancelled") return "cancelled";
  const currentRank = SHIPPING_STATUS_RANK[current ?? ""];
  const nextRank = SHIPPING_STATUS_RANK[mapped];
  if (currentRank != null && nextRank != null && nextRank < currentRank) {
    return null;
  }
  return mapped;
}

/**
 * Mapeia status bruto do provedor (SuperFrete/Melhor Envio) para `shippingStatus`.
 * `to_pack` e `packed` (por enviar) são controlados manualmente no admin.
 */
export function mapSuperfreteStatusToShippingStatus(
  sfStatus: string | null | undefined
): "to_pack" | "packed" | "shipped" | "delivered" | "cancelled" | null {
  switch (normalizeProviderShipmentStatus(sfStatus)) {
    case "posted":
      return "shipped";
    case "delivered":
      return "delivered";
    case "cancelled":
      return "cancelled";
    default:
      return null;
  }
}
