import { NextRequest, NextResponse } from "next/server";
import {
  CustomerDataStatus,
  FulfillmentType,
} from "@/app/generated/prisma/client";
import { isCarrierShippingStatusLocked } from "@/lib/fulfillment/shipping-status-policy";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/require-admin-api";
import { cpfValidationError } from "@/lib/validation/cpf";

const VALID_SHIPPING_STATUSES = [
  "to_pack",
  "packed",
  "shipped",
  "delivered",
  "cancelled",
] as const;

function asOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function onlyDigits(value: string): string {
  return value.replace(/\D/g, "");
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const updates: Record<string, unknown> = {};

  if ("shippingStatus" in b) {
    const s = b.shippingStatus;
    if (!VALID_SHIPPING_STATUSES.includes(s as (typeof VALID_SHIPPING_STATUSES)[number])) {
      return NextResponse.json(
        { error: `shippingStatus inválido. Use: ${VALID_SHIPPING_STATUSES.join(", ")}` },
        { status: 400 }
      );
    }

    const order = await prisma.order.findUnique({
      where: { id },
      select: { fulfillmentType: true, shippingStatus: true },
    });
    if (!order) {
      return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
    }

    if (isCarrierShippingStatusLocked(order)) {
      return NextResponse.json(
        {
          error:
            "Status de envio bloqueado: enviado/recebido são atualizados automaticamente pela SuperFrete.",
        },
        { status: 400 }
      );
    }

    if (
      order.fulfillmentType === FulfillmentType.CARRIER &&
      (s === "shipped" || s === "delivered")
    ) {
      return NextResponse.json(
        {
          error:
            "Pedidos com transportadora só avançam para enviado/recebido via SuperFrete.",
        },
        { status: 400 }
      );
    }

    updates.shippingStatus = s;
  }

  if ("labelUrl" in b && typeof b.labelUrl === "string") {
    updates.labelUrl = b.labelUrl.trim() || null;
  }

  if ("superfreteShipmentId" in b && typeof b.superfreteShipmentId === "string") {
    updates.superfreteShipmentId = b.superfreteShipmentId.trim() || null;
  }

  const isCustomerUpdate =
    "recipientName" in b ||
    "phone" in b ||
    "cpf" in b ||
    "destinationCep" in b ||
    "addressStreet" in b ||
    "addressNumber" in b ||
    "addressNeighborhood" in b ||
    "addressCity" in b ||
    "addressState" in b;

  const recipientName = asOptionalString(b.recipientName);
  if (recipientName !== undefined) {
    if (isCustomerUpdate && !recipientName) {
      return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
    }
    updates.recipientName = recipientName;
  }

  if ("email" in b) {
    if (b.email !== null && typeof b.email !== "string") {
      return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
    }
    const email = typeof b.email === "string" ? b.email.trim().toLowerCase() : "";
    if (!email) {
      return NextResponse.json(
        { error: "Informe o e-mail do cliente." },
        { status: 400 }
      );
    }
    if (!email.includes("@") || !email.includes(".")) {
      return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
    }
    updates.email = email;
  }

  const phone = asOptionalString(b.phone);
  if (phone !== undefined) {
    if (!phone || onlyDigits(phone).length < 10) {
      return NextResponse.json({ error: "Informe um telefone válido." }, { status: 400 });
    }
    updates.phone = onlyDigits(phone);
  }

  const cpf = asOptionalString(b.cpf);
  if (cpf !== undefined) {
    if (!cpf) {
      return NextResponse.json({ error: "Informe o CPF." }, { status: 400 });
    }
    const cpfError = cpfValidationError(cpf);
    if (cpfError) {
      return NextResponse.json({ error: cpfError }, { status: 400 });
    }
    updates.cpf = onlyDigits(cpf);
  }

  const destinationCep = asOptionalString(b.destinationCep);
  if (destinationCep !== undefined) {
    if (!destinationCep || onlyDigits(destinationCep).length !== 8) {
      return NextResponse.json({ error: "Informe um CEP válido." }, { status: 400 });
    }
    updates.destinationCep = onlyDigits(destinationCep);
  }

  const addressStreet = asOptionalString(b.addressStreet);
  if (addressStreet !== undefined) {
    if (!addressStreet) {
      return NextResponse.json({ error: "Informe a rua." }, { status: 400 });
    }
    updates.addressStreet = addressStreet;
  }

  const addressNumber = asOptionalString(b.addressNumber);
  if (addressNumber !== undefined) {
    if (!addressNumber) {
      return NextResponse.json({ error: "Informe o número." }, { status: 400 });
    }
    updates.addressNumber = addressNumber;
  }

  const addressComplement = asOptionalString(b.addressComplement);
  if (addressComplement !== undefined) updates.addressComplement = addressComplement;

  const addressNeighborhood = asOptionalString(b.addressNeighborhood);
  if (addressNeighborhood !== undefined) {
    if (!addressNeighborhood) {
      return NextResponse.json({ error: "Informe o bairro." }, { status: 400 });
    }
    updates.addressNeighborhood = addressNeighborhood;
  }

  const addressCity = asOptionalString(b.addressCity);
  if (addressCity !== undefined) {
    if (!addressCity) {
      return NextResponse.json({ error: "Informe a cidade." }, { status: 400 });
    }
    updates.addressCity = addressCity;
  }

  const addressState = asOptionalString(b.addressState);
  if (addressState !== undefined) {
    if (!addressState || addressState.length !== 2) {
      return NextResponse.json({ error: "Informe a UF." }, { status: 400 });
    }
    updates.addressState = addressState.toUpperCase();
  }

  // Edição manual no admin equivale ao preenchimento pelo cliente.
  if (isCustomerUpdate) {
    updates.customerDataStatus = CustomerDataStatus.COMPLETE;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nenhum campo para atualizar." }, { status: 400 });
  }

  try {
    const order = await prisma.order.update({
      where: { id },
      data: updates,
    });
    return NextResponse.json(order);
  } catch (e) {
    console.error("[PATCH /api/admin/orders/:id]", e);
    return NextResponse.json({ error: "Pedido não encontrado ou erro ao atualizar." }, { status: 404 });
  }
}
