import { NextRequest, NextResponse } from "next/server";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { prisma } from "@/lib/prisma";

const LIST_LIMIT = 30;
const SCAN_LIMIT = 200;

function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

function isPlaceholderEmail(email: string): boolean {
  const e = email.trim().toLowerCase();
  return !e || e.endsWith("@venda-avulsa.local") || e.startsWith("pendente-");
}

function hasUsableAddress(order: {
  addressStreet: string | null;
  destinationCep: string | null;
}): boolean {
  return Boolean(order.addressStreet?.trim() && order.destinationCep?.trim());
}

/** Agrupa a mesma pessoa: telefone → CPF → e-mail real. */
function customerKey(order: {
  phone: string | null;
  cpf: string | null;
  email: string;
}): string | null {
  const phone = digitsOnly(order.phone ?? "");
  if (phone.length >= 10) return `phone:${phone}`;

  const cpf = digitsOnly(order.cpf ?? "");
  if (cpf.length === 11) return `cpf:${cpf}`;

  const email = order.email.trim().toLowerCase();
  if (!isPlaceholderEmail(email)) return `email:${email}`;

  return null;
}

type OrderRow = {
  id: string;
  recipientName: string | null;
  phone: string | null;
  cpf: string | null;
  email: string;
  destinationCep: string | null;
  addressStreet: string | null;
  addressNumber: string | null;
  addressComplement: string | null;
  addressNeighborhood: string | null;
  addressCity: string | null;
  addressState: string | null;
  createdAt: Date;
};

export async function GET(request: NextRequest) {
  const gate = await requirePermission(PERMISSION.ADMIN_SALE_CREATE);
  if (gate instanceof NextResponse) return gate;

  const q = (request.nextUrl.searchParams.get("q") ?? "").trim();
  if (q.length < 2) {
    return NextResponse.json({ customers: [] });
  }

  const qDigits = digitsOnly(q);
  const qLower = q.toLowerCase();

  const orders = await prisma.order.findMany({
    where: {
      OR: [
        { recipientName: { not: null } },
        { phone: { not: null } },
        { cpf: { not: null } },
      ],
      AND: [
        {
          OR: [
            { recipientName: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
            { cpf: { contains: q } },
            ...(qDigits.length >= 3
              ? [
                  { phone: { contains: qDigits } },
                  { cpf: { contains: qDigits } },
                ]
              : []),
          ],
        },
      ],
    },
    select: {
      id: true,
      recipientName: true,
      phone: true,
      cpf: true,
      email: true,
      destinationCep: true,
      addressStreet: true,
      addressNumber: true,
      addressComplement: true,
      addressNeighborhood: true,
      addressCity: true,
      addressState: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: SCAN_LIMIT,
  });

  const filtered = orders.filter((o) => {
    const name = (o.recipientName ?? "").toLowerCase();
    if (name.includes(qLower)) return true;
    if (!isPlaceholderEmail(o.email) && o.email.toLowerCase().includes(qLower)) {
      return true;
    }
    if (qDigits.length >= 3) {
      if (digitsOnly(o.phone ?? "").includes(qDigits)) return true;
      if (digitsOnly(o.cpf ?? "").includes(qDigits)) return true;
    }
    return false;
  });

  type Acc = {
    key: string;
    name: string;
    email: string;
    phone: string;
    cpf: string;
    orderCount: number;
    lastContactAt: number;
    lastAddressAt: number;
    lastAddress: {
      destinationCep: string;
      street: string;
      number: string;
      complement: string;
      neighborhood: string;
      city: string;
      state: string;
    } | null;
  };

  const byKey = new Map<string, Acc>();

  for (const order of filtered as OrderRow[]) {
    const key = customerKey(order);
    if (!key) continue;

    const name = order.recipientName?.trim() || "";
    const phone = digitsOnly(order.phone ?? "");
    const cpf = digitsOnly(order.cpf ?? "");
    const email = isPlaceholderEmail(order.email) ? "" : order.email.trim().toLowerCase();
    const created = order.createdAt.getTime();

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        name,
        email,
        phone,
        cpf,
        orderCount: 1,
        lastContactAt: created,
        lastAddressAt: hasUsableAddress(order) ? created : 0,
        lastAddress: hasUsableAddress(order)
          ? {
              destinationCep: order.destinationCep ?? "",
              street: order.addressStreet ?? "",
              number: order.addressNumber ?? "",
              complement: order.addressComplement ?? "",
              neighborhood: order.addressNeighborhood ?? "",
              city: order.addressCity ?? "",
              state: order.addressState ?? "",
            }
          : null,
      });
      continue;
    }

    existing.orderCount += 1;

    // Contato do pedido mais recente
    if (created > existing.lastContactAt) {
      existing.lastContactAt = created;
      if (name) existing.name = name;
      if (phone) existing.phone = phone;
      if (cpf) existing.cpf = cpf;
      if (email) existing.email = email;
    }

    // Endereço do pedido mais recente que tenha endereço
    if (hasUsableAddress(order) && created > existing.lastAddressAt) {
      existing.lastAddressAt = created;
      existing.lastAddress = {
        destinationCep: order.destinationCep ?? "",
        street: order.addressStreet ?? "",
        number: order.addressNumber ?? "",
        complement: order.addressComplement ?? "",
        neighborhood: order.addressNeighborhood ?? "",
        city: order.addressCity ?? "",
        state: order.addressState ?? "",
      };
    }
  }

  const customers = Array.from(byKey.values())
    .filter((c) => c.name || c.phone)
    .sort((a, b) => b.lastContactAt - a.lastContactAt)
    .slice(0, LIST_LIMIT)
    .map((c) => ({
      id: c.key,
      name: c.name || "Cliente",
      email: c.email,
      phone: c.phone,
      cpf: c.cpf || null,
      orderCount: c.orderCount,
      lastAddress: c.lastAddress,
    }));

  return NextResponse.json({ customers });
}
