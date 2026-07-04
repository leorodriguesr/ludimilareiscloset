/**
 * Geração, impressão, cancelamento e consulta de etiquetas SuperFrete.
 * Fluxo: POST /cart → POST /checkout → POST /tag/print
 */

import { normalizeSuperfreteInsurance } from "@/lib/shipping/insurance";
import { superfreteRequest } from "@/lib/shipping/superfrete-client";
import {
  formatSuperfretePersonName,
  resolveStoreSender,
} from "@/lib/shipping/superfrete-account";

import { ShippingQuoteError } from "@/lib/shipping/types";

export { ShippingQuoteError };

export type LabelProduct = {
  name: string;
  quantity: number;
  unitary_value: number;
};

export type LabelInput = {
  serviceId: number;
  to: {
    name: string;
    phone?: string;
    email?: string;
    document?: string;
    address: string;
    number?: string;
    complement?: string;
    district?: string;
    city: string;
    state_abbr: string;
    postal_code: string;
  };
  products: LabelProduct[];
  volume: { height: number; width: number; length: number; weight: number };
  insuranceValue?: number;
  tag?: string;
  orderNumber?: number | null;
};

export type LabelResult = {
  shipmentId: string;
  /** Pode ser string vazia se o PDF ainda não estiver disponível após checkout. */
  labelUrl: string;
  superfreteStatus: string;
};

export type SuperfreteOrderInfo = {
  id: string;
  status: string;
  tracking: string | null;
  price: number | null;
  serviceId: number | null;
  deliveryMin: number | null;
  deliveryMax: number | null;
  labelUrl: string | null;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

function extractShipmentId(raw: unknown): string | null {
  const item = Array.isArray(raw) ? raw[0] : raw;
  const obj = asRecord(item);
  if (!obj) return null;
  if (typeof obj.id === "string" && obj.id) return obj.id;
  if (typeof obj.shipment_id === "string" && obj.shipment_id) return obj.shipment_id;
  return null;
}

export async function printSuperfreteLabel(shipmentId: string): Promise<string> {
  const raw = await superfreteRequest("POST", "/api/v0/tag/print", {
    orders: [shipmentId],
  });
  const obj = asRecord(raw);
  const url =
    (typeof obj?.url === "string" && obj.url) ||
    (typeof obj?.link === "string" && obj.link) ||
    (Array.isArray(obj?.urls) && typeof obj.urls[0] === "string" ? obj.urls[0] : null);
  if (!url) {
    throw new ShippingQuoteError(
      "PARSE",
      "URL de impressão não retornada pela SuperFrete.",
      502,
      raw
    );
  }
  return url;
}

export async function createSuperfreteLabelForOrder(input: LabelInput): Promise<LabelResult> {
  const store = await resolveStoreSender();

  const insurance = normalizeSuperfreteInsurance(
    input.insuranceValue ?? 0,
    input.serviceId
  );

  const cartBody: Record<string, unknown> = {
    service: input.serviceId,
    agency: 0,
    from: store,
    to: {
      name: formatSuperfretePersonName(input.to.name, "Destinatário"),
      phone: (input.to.phone ?? "").replace(/\D/g, "") || undefined,
      email: input.to.email || undefined,
      document: (input.to.document ?? "").replace(/\D/g, "") || undefined,
      address: input.to.address.slice(0, 50),
      complement: (input.to.complement ?? "").slice(0, 20),
      number: (input.to.number ?? "S/N").slice(0, 10),
      district: (input.to.district ?? "NA").slice(0, 60),
      city: input.to.city.slice(0, 50),
      state_abbr: input.to.state_abbr.toUpperCase().slice(0, 2),
      postal_code: input.to.postal_code.replace(/\D/g, ""),
      country_id: "BR",
    },
    products: input.products.map((p) => ({
      name: p.name.slice(0, 100),
      quantity: p.quantity,
      unitary_value: p.unitary_value,
    })),
    volumes: {
      height: input.volume.height,
      width: input.volume.width,
      length: input.volume.length,
      weight: input.volume.weight,
    },
    options: {
      insurance_value: insurance.insuranceValue,
      receipt: false,
      own_hand: false,
      non_commercial: true,
    },
    platform: "Ludimila Reis Closet",
    tag: input.tag || (input.orderNumber != null ? String(input.orderNumber) : undefined),
  };

  console.debug("[SuperFrete label] POST /api/v0/cart", JSON.stringify(cartBody));
  const cartRaw = await superfreteRequest("POST", "/api/v0/cart", cartBody);
  const shipmentId = extractShipmentId(cartRaw);
  if (!shipmentId) {
    throw new ShippingQuoteError(
      "PARSE",
      "ID do envio não retornado pela SuperFrete.",
      502,
      cartRaw
    );
  }

  console.debug("[SuperFrete label] POST /api/v0/checkout", { orders: [shipmentId] });
  await superfreteRequest("POST", "/api/v0/checkout", { orders: [shipmentId] });

  // PDF via /api/admin/orders/:id/label/pdf (tag/print sob demanda).
  return {
    shipmentId,
    labelUrl: "",
    superfreteStatus: "released",
  };
}

function extractTracking(obj: Record<string, unknown>): string | null {
  for (const key of ["tracking", "tracking_code", "trackingCode", "code"] as const) {
    const v = obj[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export async function fetchSuperfreteOrderInfo(
  shipmentId: string
): Promise<SuperfreteOrderInfo> {
  const raw = await superfreteRequest("GET", `/api/v0/order/info/${encodeURIComponent(shipmentId)}`);
  const obj = asRecord(raw);
  if (!obj) {
    throw new ShippingQuoteError("PARSE", "Resposta inválida da SuperFrete.", 502, raw);
  }

  const print = asRecord(obj.print);
  const serviceIdRaw = obj.service_id ?? obj.serviceId;
  const serviceId =
    typeof serviceIdRaw === "number"
      ? serviceIdRaw
      : typeof serviceIdRaw === "string"
        ? Number(serviceIdRaw)
        : null;

  return {
    id: String(obj.id ?? shipmentId),
    status: String(obj.status ?? "unknown"),
    tracking: extractTracking(obj),
    price: typeof obj.price === "number" ? obj.price : null,
    serviceId: Number.isFinite(serviceId) ? serviceId : null,
    deliveryMin: typeof obj.delivery_min === "number" ? obj.delivery_min : null,
    deliveryMax: typeof obj.delivery_max === "number" ? obj.delivery_max : null,
    labelUrl: print && typeof print.url === "string" ? print.url : null,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** SuperFrete pode demorar alguns segundos após checkout para liberar o rastreio. */
export async function fetchSuperfreteOrderInfoWithTrackingPoll(
  shipmentId: string,
  options?: { attempts?: number; intervalMs?: number; maxWaitMs?: number }
): Promise<SuperfreteOrderInfo> {
  const intervalMs = options?.intervalMs ?? 1500;
  const maxWaitMs = options?.maxWaitMs ?? 12_000;
  const deadline = Date.now() + maxWaitMs;
  const maxAttempts = options?.attempts ?? 10;

  let info = await fetchSuperfreteOrderInfo(shipmentId);
  let attempt = 1;

  while (!info.tracking && attempt < maxAttempts && Date.now() < deadline) {
    await sleep(intervalMs);
    info = await fetchSuperfreteOrderInfo(shipmentId);
    attempt++;
  }

  return info;
}

export async function cancelSuperfreteOrder(
  shipmentId: string,
  reason = "Cancelado pelo administrador"
): Promise<void> {
  await superfreteRequest("POST", "/api/v0/order/cancel", {
    order: { id: shipmentId, description: reason },
  });
}
