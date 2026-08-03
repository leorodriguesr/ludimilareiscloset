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
  undelivered: "Não entregue",
  paused: "Pausado",
  suspended: "Suspenso",
};

/**
 * Mapeia status bruto do provedor (SuperFrete/Melhor Envio) para `shippingStatus`.
 * `to_pack` e `packed` (por enviar) são controlados manualmente no admin.
 */
export function mapSuperfreteStatusToShippingStatus(
  sfStatus: string | null | undefined
): "to_pack" | "packed" | "shipped" | "delivered" | "cancelled" | null {
  switch (sfStatus) {
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
