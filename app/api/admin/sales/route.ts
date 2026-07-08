import { NextRequest, NextResponse } from "next/server";
import { DiscountMode, FulfillmentType } from "@/app/generated/prisma/client";
import type { ArrangedDeliveryMode } from "@/lib/admin-sale/arranged-delivery";
import { createAdminSale } from "@/lib/admin-sale/create-admin-sale";
import { parseDiscountInputValue } from "@/lib/admin-sale/parse-discount-value";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { PAYMENT_METHOD } from "@/lib/orders/constants";

function parseDiscount(raw: unknown) {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  const mode = d.mode === "PERCENT" ? DiscountMode.PERCENT : d.mode === "FIXED" ? DiscountMode.FIXED : null;
  const value = parseDiscountInputValue(d.value);
  if (!mode || value == null) return undefined;
  return { mode, value };
}

function parseArrangedMode(raw: unknown): ArrangedDeliveryMode | undefined {
  if (
    raw === "store_delivery" ||
    raw === "pickup" ||
    raw === "uber"
  ) {
    return raw;
  }
  return undefined;
}

export async function POST(request: NextRequest) {
  const gate = await requirePermission(PERMISSION.ADMIN_SALE_CREATE);
  if (gate instanceof NextResponse) return gate;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const fulfillmentType =
    b.fulfillmentType === "ARRANGED"
      ? FulfillmentType.ARRANGED
      : FulfillmentType.CARRIER;

  const paymentMethod =
    b.paymentMethod === "card" ? PAYMENT_METHOD.CARD : PAYMENT_METHOD.PIX;

  const lines = Array.isArray(b.lines) ? b.lines : [];
  if (lines.length === 0) {
    return NextResponse.json({ error: "Adicione produtos." }, { status: 400 });
  }

  const result = await createAdminSale({
    lines: lines.map((l) => {
      const row = l as Record<string, unknown>;
      return {
        productId: String(row.productId ?? ""),
        quantity: Number(row.quantity ?? 1),
        pieceSelections: Array.isArray(row.pieceSelections)
          ? row.pieceSelections
          : undefined,
        itemDiscount: parseDiscount(row.itemDiscount),
      };
    }),
    fulfillmentType,
    carrierShipping:
      fulfillmentType === FulfillmentType.CARRIER &&
      b.carrierShipping &&
      typeof b.carrierShipping === "object"
        ? {
            destinationCep: String(
              (b.carrierShipping as Record<string, unknown>).destinationCep ?? ""
            ),
            optionId: String(
              (b.carrierShipping as Record<string, unknown>).optionId ?? ""
            ),
          }
        : undefined,
    arrangedShippingAmount:
      fulfillmentType === FulfillmentType.ARRANGED
        ? Number(b.arrangedShippingAmount ?? 0)
        : undefined,
    arrangedMode:
      fulfillmentType === FulfillmentType.ARRANGED
        ? parseArrangedMode(b.arrangedMode)
        : undefined,
    deliveryNotes:
      typeof b.deliveryNotes === "string" ? b.deliveryNotes : undefined,
    internalNotes:
      typeof b.internalNotes === "string" ? b.internalNotes : undefined,
    customerData: b.customerData === "now" ? "now" : "later",
    contact:
      b.contact && typeof b.contact === "object"
        ? {
            name: String((b.contact as Record<string, unknown>).name ?? ""),
            email: String((b.contact as Record<string, unknown>).email ?? ""),
            phone: String((b.contact as Record<string, unknown>).phone ?? ""),
            cpf:
              typeof (b.contact as Record<string, unknown>).cpf === "string"
                ? (b.contact as Record<string, unknown>).cpf as string
                : undefined,
          }
        : undefined,
    address:
      b.address && typeof b.address === "object"
        ? {
            destinationCep: String(
              (b.address as Record<string, unknown>).destinationCep ?? ""
            ),
            street: String((b.address as Record<string, unknown>).street ?? ""),
            number: String((b.address as Record<string, unknown>).number ?? ""),
            complement:
              typeof (b.address as Record<string, unknown>).complement ===
              "string"
                ? ((b.address as Record<string, unknown>).complement as string)
                : undefined,
            neighborhood: String(
              (b.address as Record<string, unknown>).neighborhood ?? ""
            ),
            city: String((b.address as Record<string, unknown>).city ?? ""),
            state: String((b.address as Record<string, unknown>).state ?? ""),
          }
        : undefined,
    paymentAlreadyPaid: b.paymentAlreadyPaid === true,
    paymentMethod,
    orderDiscount: parseDiscount(b.orderDiscount),
    createdByUserId: gate.userId,
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json(result);
}
