import {
  readSuperFreteClientConfig,
  superfreteRequest,
  asRecord,
} from "@/lib/shipping/superfrete-client";
import { superfreteWalletUrlForTarget } from "@/lib/shipping/superfrete-env";
import { ShippingQuoteError } from "@/lib/shipping/types";

export type SuperfreteUserInfo = {
  id: string;
  firstname: string;
  lastname: string;
  phone: string;
  email: string;
  document: string;
  balance: number;
  shipmentsPending: number;
  shipmentsAvailable: number;
};

export type SuperfreteAddress = {
  postal_code: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state_abbr: string;
};

export type StoreSender = {
  name: string;
  document: string;
  phone: string;
  email: string;
  address: string;
  number: string;
  complement: string;
  district: string;
  city: string;
  state_abbr: string;
  postal_code: string;
  country_id: "BR";
};

/** Nome com nome + sobrenome (exigência SuperFrete). */
export function formatSuperfretePersonName(name: string, fallback = "Destinatário"): string {
  const trimmed = name.trim();
  if (!trimmed) return fallback;
  if (!trimmed.includes(" ")) return `Loja ${trimmed}`.slice(0, 50);
  return trimmed.slice(0, 50);
}

function extractAddressList(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw;
  const root = asRecord(raw);
  if (!root) return [];

  for (const key of ["data", "addresses", "items", "results"] as const) {
    const candidate = root[key];
    if (Array.isArray(candidate)) return candidate;
  }

  return [];
}

function parseAddressRow(row: Record<string, unknown>): SuperfreteAddress | null {
  const postal =
    String(row.postal_code ?? row.postalCode ?? row.cep ?? "").replace(/\D/g, "") || null;
  const address = String(
    row.address ?? row.street ?? row.logradouro ?? row.line1 ?? ""
  ).trim();
  const city = String(row.city ?? row.cidade ?? "").trim();
  const state = String(row.state_abbr ?? row.state ?? row.uf ?? "")
    .trim()
    .toUpperCase()
    .slice(0, 2);

  if (!postal || postal.length !== 8 || !address || !city || state.length !== 2) {
    return null;
  }

  return {
    postal_code: postal,
    address,
    number: String(row.number ?? row.numero ?? "").trim() || "S/N",
    complement: String(row.complement ?? row.complemento ?? "").trim(),
    district: String(row.district ?? row.bairro ?? row.neighborhood ?? "").trim() || "NA",
    city,
    state_abbr: state,
  };
}

export async function fetchSuperfreteUserInfo(): Promise<SuperfreteUserInfo> {
  const raw = await superfreteRequest("GET", "/api/v0/user");
  const obj = asRecord(raw);
  if (!obj) {
    throw new ShippingQuoteError("PARSE", "Resposta inválida da SuperFrete (usuário).", 502);
  }

  const limits = asRecord(obj.limits);

  return {
    id: String(obj.id ?? ""),
    firstname: String(obj.firstname ?? ""),
    lastname: String(obj.lastname ?? ""),
    phone: String(obj.phone ?? ""),
    email: String(obj.email ?? ""),
    document: String(obj.document ?? "").replace(/\D/g, ""),
    balance: typeof obj.balance === "number" ? obj.balance : Number(obj.balance) || 0,
    shipmentsPending: typeof limits?.shipments === "number" ? limits.shipments : 0,
    shipmentsAvailable:
      typeof limits?.shipments_available === "number" ? limits.shipments_available : 0,
  };
}

async function loadSuperfreteAddresses(): Promise<{
  parsed: SuperfreteAddress[];
  rawList: Record<string, unknown>[];
}> {
  const raw = await superfreteRequest("GET", "/api/v0/user/addresses");
  const list = extractAddressList(raw);

  if (process.env.NODE_ENV === "development" && list.length === 0) {
    console.warn("[SuperFrete] /api/v0/user/addresses retornou lista vazia:", raw);
  }

  const rawList = list.map((item) => asRecord(item) ?? {});
  const parsed = rawList
    .map((item) => parseAddressRow(item))
    .filter((a): a is SuperfreteAddress => a != null);

  return { parsed, rawList };
}

export async function fetchSuperfreteAddresses(): Promise<SuperfreteAddress[]> {
  const { parsed } = await loadSuperfreteAddresses();
  return parsed;
}

function senderFromEnv(): Partial<StoreSender> | null {
  const cfg = readSuperFreteClientConfig();
  const address = process.env.STORE_ADDRESS?.trim();
  const city = process.env.STORE_CITY?.trim();
  const state = (process.env.STORE_STATE?.trim() || "").toUpperCase().slice(0, 2);

  if (!address || !city || state.length !== 2) return null;

  return {
    name: process.env.STORE_NAME?.trim() || "Ludimila Reis Closet",
    document: (process.env.STORE_DOCUMENT ?? "").replace(/\D/g, ""),
    phone: (process.env.STORE_PHONE ?? "").replace(/\D/g, ""),
    email: process.env.STORE_EMAIL?.trim() || "",
    address,
    number: process.env.STORE_NUMBER?.trim() || "S/N",
    complement: process.env.STORE_COMPLEMENT?.trim() || "",
    district: process.env.STORE_DISTRICT?.trim() || "NA",
    city,
    state_abbr: state,
    postal_code: cfg.originPostalCode,
    country_id: "BR",
  };
}

function pickStoreAddress(
  addresses: SuperfreteAddress[],
  originPostalCode: string
): SuperfreteAddress | null {
  if (addresses.length === 0) return null;
  return addresses.find((a) => a.postal_code === originPostalCode) ?? addresses[0];
}

let storeSenderCache: { value: StoreSender; expiresAt: number } | null = null;
const STORE_SENDER_CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutos

/** Remetente: env STORE_* ou endereço cadastrado na conta SuperFrete. Cacheado 5min. */
export async function resolveStoreSender(): Promise<StoreSender> {
  if (storeSenderCache && Date.now() < storeSenderCache.expiresAt) {
    return storeSenderCache.value;
  }
  const fromEnv = senderFromEnv();
  if (fromEnv?.address && fromEnv.city && fromEnv.state_abbr) {
    const value: StoreSender = {
      name: formatSuperfretePersonName(fromEnv.name ?? "Ludimila Reis Closet"),
      document: fromEnv.document ?? "",
      phone: fromEnv.phone ?? "",
      email: fromEnv.email ?? "",
      address: fromEnv.address,
      number: fromEnv.number ?? "S/N",
      complement: fromEnv.complement ?? "",
      district: fromEnv.district ?? "NA",
      city: fromEnv.city,
      state_abbr: fromEnv.state_abbr,
      postal_code: fromEnv.postal_code!,
      country_id: "BR",
    };
    storeSenderCache = { value, expiresAt: Date.now() + STORE_SENDER_CACHE_TTL_MS };
    return value;
  }

  const [user, addressResult] = await Promise.all([
    fetchSuperfreteUserInfo(),
    loadSuperfreteAddresses(),
  ]);

  const cfg = readSuperFreteClientConfig();
  const { parsed: addresses, rawList } = addressResult;

  // Preferir endereço padrão ou rotulado como loja na SuperFrete
  const defaultRaw = rawList.find((r) => r.is_default === true);
  const storeLabelRaw = rawList.find((r) => {
    const label = String(r.label ?? "").toLowerCase();
    return label.includes("loja") || label.includes("store");
  });

  const addr =
    (defaultRaw ? parseAddressRow(defaultRaw) : null) ??
    (storeLabelRaw ? parseAddressRow(storeLabelRaw) : null) ??
    pickStoreAddress(addresses, cfg.originPostalCode);

  if (!addr) {
    throw new ShippingQuoteError(
      "CONFIG",
      "Endereço da loja não configurado. Defina STORE_ADDRESS, STORE_CITY e STORE_STATE no .env ou cadastre um endereço em Perfil → Meus Endereços na SuperFrete.",
      503
    );
  }

  const fullName = [user.firstname, user.lastname].filter(Boolean).join(" ").trim();

  const value: StoreSender = {
    name: formatSuperfretePersonName(
      process.env.STORE_NAME?.trim() || fullName || "Ludimila Reis Closet"
    ),
    document: (process.env.STORE_DOCUMENT ?? user.document).replace(/\D/g, ""),
    phone: (process.env.STORE_PHONE ?? user.phone).replace(/\D/g, ""),
    email: process.env.STORE_EMAIL?.trim() || user.email,
    address: addr.address,
    number: addr.number || "S/N",
    complement: addr.complement,
    district: addr.district || "NA",
    city: addr.city,
    state_abbr: addr.state_abbr,
    postal_code: addr.postal_code || cfg.originPostalCode,
    country_id: "BR",
  };
  storeSenderCache = { value, expiresAt: Date.now() + STORE_SENDER_CACHE_TTL_MS };
  return value;
}

export function superfreteWalletUrl(): string {
  const cfg = readSuperFreteClientConfig();
  return superfreteWalletUrlForTarget(cfg.target);
}
