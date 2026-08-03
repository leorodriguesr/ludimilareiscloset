import {
  formatSuperfretePersonName,
  resolveStoreSender,
} from "@/lib/shipping/superfrete-account";
import type {
  LabelInput,
  LabelResult,
  SuperfreteOrderInfo,
} from "@/lib/shipping/superfrete-label";
import {
  melhorEnvioRequest,
  meAsRecord,
  meNum,
} from "@/lib/shipping/melhor-envio/client";
import { ShippingQuoteError } from "@/lib/shipping/types";
import type { MelhorEnvioQuotePackage } from "@/lib/shipping/melhor-envio/quote";

function toMeParty(
  party: LabelInput["to"],
  nameFallback: string,
  options?: { stateRegister?: string }
): Record<string, unknown> {
  const document = (party.document ?? "").replace(/\D/g, "");
  return {
    name: formatSuperfretePersonName(party.name, nameFallback),
    phone: (party.phone ?? "").replace(/\D/g, "") || undefined,
    email: party.email || undefined,
    document: document || undefined,
    address: party.address.slice(0, 50),
    complement: (party.complement ?? "").slice(0, 20),
    number: (party.number ?? "S/N").slice(0, 10),
    district: (party.district ?? "NA").slice(0, 60),
    city: party.city.slice(0, 50),
    state_abbr: party.state_abbr.toUpperCase().slice(0, 2),
    postal_code: party.postal_code.replace(/\D/g, ""),
    country_id: "BR",
    ...(options?.stateRegister != null
      ? { state_register: options.stateRegister }
      : {}),
  };
}

function volumesFromInput(
  input: LabelInput,
  packages?: MelhorEnvioQuotePackage[] | null
): Array<{ height: number; width: number; length: number; weight: number }> {
  if (packages?.length) {
    return packages.map((p) => ({
      height: Number(p.dimensions.height),
      width: Number(p.dimensions.width),
      length: Number(p.dimensions.length),
      weight: Number(p.weight),
    }));
  }
  return [
    {
      height: input.volume.height,
      width: input.volume.width,
      length: input.volume.length,
      weight: input.volume.weight,
    },
  ];
}

/** Transportadoras que exigem 1 volume por etiqueta. */
const SINGLE_VOLUME_SERVICES = new Set([1, 2, 17, 31]);

export async function createMelhorEnvioLabelForOrder(
  input: LabelInput & { packages?: MelhorEnvioQuotePackage[] | null }
): Promise<LabelResult> {
  const store = await resolveStoreSender();
  const fromParty = input.from
    ? toMeParty(input.from, "Remetente", { stateRegister: "ISENTO" })
    : { ...store, state_register: "ISENTO" };
  const toParty = toMeParty(input.to, "Destinatário");

  const insurance =
    input.insuranceValue != null && Number.isFinite(input.insuranceValue)
      ? Math.max(0, Math.round(input.insuranceValue * 100) / 100)
      : 0;

  const allVolumes = volumesFromInput(input, input.packages);
  const split =
    SINGLE_VOLUME_SERVICES.has(input.serviceId) && allVolumes.length > 1;
  const volumeBatches = split ? allVolumes.map((v) => [v]) : [allVolumes];

  const createdIds: string[] = [];
  let checkoutError: string | undefined;

  const products = input.products.map((p, idx) => ({
    id: `item-${idx + 1}`,
    name: p.name.slice(0, 100),
    quantity: p.quantity,
    unitary_value: p.unitary_value,
  }));

  for (const volumes of volumeBatches) {
    const cartBody = {
      service: input.serviceId,
      from: fromParty,
      to: toParty,
      products,
      volumes,
      options: {
        insurance_value: insurance,
        receipt: false,
        own_hand: false,
        non_commercial: true,
        platform: "Ludimila Reis Closet",
        tags: [
          {
            tag:
              input.tag ||
              (input.orderNumber != null ? String(input.orderNumber) : "pedido"),
            url: null as string | null,
          },
        ],
        reminder:
          input.orderNumber != null
            ? `Pedido #${input.orderNumber}`
            : undefined,
      },
    };

    console.debug(
      "[MelhorEnvio label] POST /api/v2/me/cart",
      JSON.stringify(cartBody)
    );
    const cartRaw = await melhorEnvioRequest("POST", "/api/v2/me/cart", cartBody);
    const cart = meAsRecord(cartRaw);
    const shipmentId = typeof cart?.id === "string" ? cart.id : null;
    if (!shipmentId) {
      throw new ShippingQuoteError(
        "PARSE",
        "ID do envio não retornado pelo Melhor Envio.",
        502,
        cartRaw
      );
    }
    createdIds.push(shipmentId);
  }

  const primaryId = createdIds[0]!;

  try {
    await checkoutMelhorEnvioOrders(createdIds);
  } catch (e) {
    checkoutError =
      e instanceof Error ? e.message : "Falha no checkout Melhor Envio.";
    console.warn(
      `[MelhorEnvio label] checkout falhou para ${createdIds.join(",")}:`,
      checkoutError
    );
    return {
      shipmentId: primaryId,
      labelUrl: "",
      superfreteStatus: await resolveStatusAfterCart(primaryId, "pending"),
      checkoutError,
    };
  }

  try {
    await generateMelhorEnvioLabels(createdIds);
  } catch (e) {
    console.warn(
      `[MelhorEnvio label] generate falhou para ${createdIds.join(",")}:`,
      e instanceof Error ? e.message : e
    );
  }

  return {
    shipmentId: primaryId,
    labelUrl: "",
    superfreteStatus: await resolveStatusAfterCart(primaryId, "released"),
  };
}

export async function checkoutMelhorEnvioOrders(
  shipmentIds: string[]
): Promise<void> {
  if (!shipmentIds.length) return;
  await melhorEnvioRequest("POST", "/api/v2/me/shipment/checkout", {
    orders: shipmentIds,
  });
}

export async function generateMelhorEnvioLabels(
  shipmentIds: string[]
): Promise<void> {
  if (!shipmentIds.length) return;
  await melhorEnvioRequest("POST", "/api/v2/me/shipment/generate", {
    orders: shipmentIds,
  });
}

export async function printMelhorEnvioLabel(
  shipmentId: string,
  mode: "private" | "public" = "public"
): Promise<string> {
  try {
    await generateMelhorEnvioLabels([shipmentId]);
  } catch {
    /* pode já estar gerada */
  }

  const raw = await melhorEnvioRequest("POST", "/api/v2/me/shipment/print", {
    mode,
    orders: [shipmentId],
  });
  const obj = meAsRecord(raw);
  const url = typeof obj?.url === "string" ? obj.url : null;
  if (!url) {
    throw new ShippingQuoteError(
      "PARSE",
      "URL de impressão não retornada pelo Melhor Envio.",
      502,
      raw
    );
  }
  return url;
}

export async function fetchMelhorEnvioOrderInfo(
  shipmentId: string
): Promise<SuperfreteOrderInfo> {
  const raw = await melhorEnvioRequest("POST", "/api/v2/me/shipment/tracking", {
    orders: [shipmentId],
  });
  const root = meAsRecord(raw);
  const info = meAsRecord(root?.[shipmentId]) ?? root;
  if (!info) {
    throw new ShippingQuoteError(
      "PARSE",
      "Resposta inválida do Melhor Envio.",
      502,
      raw
    );
  }

  return {
    id: String(info.id ?? shipmentId),
    status: String(info.status ?? "unknown"),
    tracking: extractMelhorEnvioTracking(info),
    price: meNum(info.price),
    serviceId: meNum(info.service_id ?? info.serviceId),
    deliveryMin: meNum(info.delivery_min ?? info.deliveryMin),
    deliveryMax: meNum(info.delivery_max ?? info.deliveryMax),
    labelUrl: null,
  };
}

/** Protocolo interno ME (ORD-...) — não é código de rastreio. */
export function isMelhorEnvioProtocolCode(value: string | null | undefined): boolean {
  return Boolean(value && /^ORD-/i.test(value.trim()));
}

function asTrackingCandidate(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || isMelhorEnvioProtocolCode(trimmed)) return null;
  return trimmed;
}

function extractMelhorEnvioTracking(
  info: Record<string, unknown>
): string | null {
  // Prioridade: rastreio da transportadora (`tracking` = AD…/BR…)
  // antes do código interno ME (`melhorenvio_tracking` = ME…).
  // Nunca usar `protocol` (ORD-...).
  const keys = [
    "tracking",
    "self_tracking",
    "tracking_code",
    "melhorenvio_tracking",
  ] as const;
  for (const key of keys) {
    const candidate = asTrackingCandidate(info[key]);
    if (candidate) return candidate;
  }
  const nested = meAsRecord(info.tracking);
  if (nested) {
    for (const key of ["code", "number", "tracking"] as const) {
      const candidate = asTrackingCandidate(nested[key]);
      if (candidate) return candidate;
    }
  }
  return null;
}

async function resolveStatusAfterCart(
  shipmentId: string,
  fallback: string
): Promise<string> {
  try {
    const info = await fetchMelhorEnvioOrderInfo(shipmentId);
    return info.status || fallback;
  } catch {
    return fallback;
  }
}

export async function fetchMelhorEnvioOrderInfoWithTrackingPoll(
  shipmentId: string,
  options?: { attempts?: number; intervalMs?: number; maxWaitMs?: number }
): Promise<SuperfreteOrderInfo> {
  const intervalMs = options?.intervalMs ?? 1500;
  const maxWaitMs = options?.maxWaitMs ?? 12_000;
  const deadline = Date.now() + maxWaitMs;
  const maxAttempts = options?.attempts ?? 10;

  let info = await fetchMelhorEnvioOrderInfo(shipmentId);
  let attempt = 1;
  while (!info.tracking && attempt < maxAttempts && Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, intervalMs));
    info = await fetchMelhorEnvioOrderInfo(shipmentId);
    attempt++;
  }
  return info;
}

export async function cancelMelhorEnvioOrder(
  shipmentId: string,
  reason = "Cancelado pelo administrador"
): Promise<void> {
  try {
    const can = await melhorEnvioRequest(
      "POST",
      "/api/v2/me/shipment/cancellable",
      { orders: [shipmentId] }
    );
    const root = meAsRecord(can);
    const row = meAsRecord(root?.[shipmentId]);
    if (row && row.cancellable === false) {
      throw new ShippingQuoteError(
        "VALIDATION",
        "Esta etiqueta não pode mais ser cancelada no Melhor Envio.",
        400,
        can
      );
    }
  } catch (e) {
    if (e instanceof ShippingQuoteError && e.code === "VALIDATION") throw e;
  }

  await melhorEnvioRequest("POST", "/api/v2/me/shipment/cancel", {
    order: {
      id: shipmentId,
      reason_id: "2",
      description: reason.slice(0, 255),
    },
  });
}
