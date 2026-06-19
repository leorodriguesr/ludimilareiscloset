/** Converte optionId da loja (ex.: "sf:3") em serviceId numérico SuperFrete. */
export function parseSuperfreteServiceId(optionId: string): number | null {
  const trimmed = optionId.trim();
  const prefixed = trimmed.match(/^sf:(\d+)$/i);
  if (prefixed) return Number(prefixed[1]);
  const n = Number(trimmed);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
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
  pending: "Aguardando pagamento (SF)",
  released: "Etiqueta paga — aguardando postagem",
  posted: "Postado",
  delivered: "Entregue",
  cancelled: "Cancelado",
};

export function mapSuperfreteStatusToShippingStatus(
  sfStatus: string | null | undefined
): "to_pack" | "packed" | "shipped" | "delivered" | "cancelled" | null {
  switch (sfStatus) {
    case "pending":
      return "packed";
    case "released":
      return "packed";
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
