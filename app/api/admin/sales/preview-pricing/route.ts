import { NextRequest, NextResponse } from "next/server";
import {
  normalizeAdminSaleLineInput,
  resolveAdminSalePricing,
} from "@/lib/admin-sale/pricing";
import { DiscountMode } from "@/app/generated/prisma/client";
import { parseDiscountInputValue } from "@/lib/admin-sale/parse-discount-value";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";
import { PAYMENT_METHOD } from "@/lib/orders/constants";

function parseDiscount(raw: unknown) {
  if (!raw || typeof raw !== "object") return undefined;
  const d = raw as Record<string, unknown>;
  const mode =
    d.mode === "PERCENT"
      ? DiscountMode.PERCENT
      : d.mode === "FIXED"
        ? DiscountMode.FIXED
        : null;
  const value = parseDiscountInputValue(d.value);
  if (!mode || value == null) return undefined;
  return { mode, value };
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
  const lines = Array.isArray(b.lines) ? b.lines : [];
  const paymentMethod =
    b.paymentMethod === "card" ? PAYMENT_METHOD.CARD : PAYMENT_METHOD.PIX;
  const shippingAmount = Math.max(0, Number(b.shippingAmount ?? 0));

  try {
    const pricing = await resolveAdminSalePricing({
      lines: lines.map((l) => {
        const row = l as Record<string, unknown>;
        return normalizeAdminSaleLineInput(row, parseDiscount(row.itemDiscount));
      }),
      paymentMethod,
      shippingAmount,
      orderDiscount: parseDiscount(b.orderDiscount),
    });
    return NextResponse.json(pricing);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erro ao calcular." },
      { status: 400 }
    );
  }
}
