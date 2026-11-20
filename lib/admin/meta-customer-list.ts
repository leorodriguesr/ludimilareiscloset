/** Lista de clientes no formato do arquivo de exemplo da Meta (público com valor). */

export const META_CUSTOMER_LIST_HEADER =
  "email,email,email,phone,phone,phone,madid,fn,ln,zip,ct,st,country,dob,doby,gen,age,uid,value";

export type MetaCustomerOrder = {
  userId: string | null;
  email: string | null;
  userEmail: string | null;
  phone: string | null;
  conversationPhone: string | null;
  userPhone: string | null;
  recipientName: string | null;
  userName: string | null;
  cep: string | null;
  city: string | null;
  state: string | null;
  total: number;
  paidAt: Date | null;
};

const UFS = new Set([
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS",
  "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC",
  "SP", "SE", "TO",
]);

const STATE_BY_NAME: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapa: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceara: "CE",
  "distrito federal": "DF",
  "espirito santo": "ES",
  goias: "GO",
  maranhao: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  para: "PA",
  paraiba: "PB",
  parana: "PR",
  pernambuco: "PE",
  piaui: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondonia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "sao paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

function stripAccents(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "");
}

export function brazilianPhoneKey(phone: string | null | undefined): string | null {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    return digits;
  }
  return null;
}

export function formatMetaPhone(key: string): string {
  const national = key.startsWith("55") ? key.slice(2) : key;
  const ddd = national.slice(0, 2);
  const number = national.slice(2);
  if (number.length === 9) {
    return `+55 ${ddd} ${number.slice(0, 5)}-${number.slice(5)}`;
  }
  return `+55 ${ddd} ${number.slice(0, 4)}-${number.slice(4)}`;
}

export function normalizeMetaEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? "";
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) return null;
  if (value.endsWith("@venda-avulsa.local")) return null;
  return value;
}

export function formatMetaState(state: string | null | undefined): string {
  const raw = stripAccents(state ?? "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (upper.length === 2 && UFS.has(upper)) return upper;
  return STATE_BY_NAME[raw.toLowerCase()] ?? "";
}

function formatCity(city: string | null | undefined): string {
  return stripAccents(city ?? "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function formatZip(cep: string | null | undefined): string {
  const digits = (cep ?? "").replace(/\D/g, "");
  if (digits.length < 8) return "";
  const eight = digits.slice(0, 8);
  return `${eight.slice(0, 5)}-${eight.slice(5)}`;
}

function splitName(name: string | null | undefined): { fn: string; ln: string } {
  const clean = stripAccents(name ?? "")
    .replace(/[^A-Za-z\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!clean) return { fn: "", ln: "" };
  const [first, ...rest] = clean.split(" ");
  return { fn: first, ln: rest.join(" ") };
}

function formatValue(value: number): string {
  const rounded = Math.round(value * 100) / 100;
  if (!Number.isFinite(rounded) || rounded <= 0) return "";
  return rounded.toFixed(2).replace(/\.?0+$/, "");
}

function csvField(value: string): string {
  if (/[",\n\r]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function uniquePhones(order: MetaCustomerOrder): string[] {
  const keys: string[] = [];
  for (const phone of [order.conversationPhone, order.phone, order.userPhone]) {
    const key = brazilianPhoneKey(phone);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}

function uniqueEmails(order: MetaCustomerOrder): string[] {
  const emails: string[] = [];
  for (const email of [order.email, order.userEmail]) {
    const normalized = normalizeMetaEmail(email);
    if (normalized && !emails.includes(normalized)) emails.push(normalized);
  }
  return emails;
}

function find(parent: number[], index: number): number {
  let current = index;
  while (parent[current] !== current) current = parent[current];
  let cursor = index;
  while (parent[cursor] !== current) {
    const next = parent[cursor];
    parent[cursor] = current;
    cursor = next;
  }
  return current;
}

function union(parent: number[], a: number, b: number) {
  const rootA = find(parent, a);
  const rootB = find(parent, b);
  if (rootA !== rootB) parent[rootB] = rootA;
}

function link(map: Map<string, number>, parent: number[], key: string, index: number) {
  const previous = map.get(key);
  if (previous == null) map.set(key, index);
  else union(parent, previous, index);
}

export function buildMetaCustomerListCsv(orders: MetaCustomerOrder[]): {
  csv: string;
  customers: number;
} {
  const parent = orders.map((_, index) => index);
  const byPhone = new Map<string, number>();
  const byUser = new Map<string, number>();
  const byEmail = new Map<string, number>();

  orders.forEach((order, index) => {
    for (const phone of uniquePhones(order)) link(byPhone, parent, phone, index);
    if (order.userId) link(byUser, parent, order.userId, index);
    for (const email of uniqueEmails(order)) link(byEmail, parent, email, index);
  });

  const groups = new Map<number, MetaCustomerOrder[]>();
  orders.forEach((order, index) => {
    const root = find(parent, index);
    const group = groups.get(root) ?? [];
    group.push(order);
    groups.set(root, group);
  });

  const rows = [...groups.values()]
    .map((group) => toRow(group))
    .filter((row): row is string[] => row != null)
    .sort((a, b) => Number(b[18]) - Number(a[18]));

  const csv = [META_CUSTOMER_LIST_HEADER, ...rows.map((row) => row.map(csvField).join(","))].join(
    "\n"
  );
  return { csv: `${csv}\n`, customers: rows.length };
}

function toRow(group: MetaCustomerOrder[]): string[] | null {
  const ordered = [...group].sort(
    (a, b) => (b.paidAt?.getTime() ?? 0) - (a.paidAt?.getTime() ?? 0)
  );
  const phones = uniqueInOrder(ordered.flatMap(uniquePhones)).slice(0, 3);
  const emails = uniqueInOrder(ordered.flatMap(uniqueEmails)).slice(0, 3);
  const value = formatValue(ordered.reduce((sum, order) => sum + order.total, 0));
  if (!value || (phones.length === 0 && emails.length === 0)) return null;

  const name = splitName(
    ordered.find((order) => order.recipientName?.trim() || order.userName?.trim())
      ?.recipientName?.trim() ||
      ordered.find((order) => order.userName?.trim())?.userName
  );
  const city = formatCity(ordered.find((order) => formatCity(order.city))?.city);
  const state = formatMetaState(ordered.find((order) => formatMetaState(order.state))?.state);
  const zip = formatZip(ordered.find((order) => formatZip(order.cep))?.cep);
  const uid = ordered.find((order) => order.userId)?.userId || phones[0] || emails[0];

  return [
    emails[0] ?? "",
    emails[1] ?? "",
    emails[2] ?? "",
    phones[0] ? formatMetaPhone(phones[0]) : "",
    phones[1] ? formatMetaPhone(phones[1]) : "",
    phones[2] ? formatMetaPhone(phones[2]) : "",
    "",
    name.fn,
    name.ln,
    zip,
    city,
    state,
    "BR",
    "",
    "",
    "",
    "",
    uid,
    value,
  ];
}

function uniqueInOrder(values: string[]): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const value of values) {
    if (seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}
