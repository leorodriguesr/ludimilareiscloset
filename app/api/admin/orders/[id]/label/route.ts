import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/require-admin-api";
import {
  createSuperfreteLabelForOrder,
  ShippingQuoteError,
  type LabelInput,
} from "@/lib/shipping/superfrete-label";
import { packageToSuperFreteKgCm } from "@/lib/shipping/superfrete";

const DEFAULT_PKG = { weightGrams: 300, lengthCm: 16, widthCm: 11, heightCm: 2 };

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const { id } = await params;

  let body: { serviceId?: unknown } = {};
  try { body = await request.json(); } catch { /* serviceId opcional */ }

  const serviceId = Number(body?.serviceId ?? 1); // 1=PAC por padrão
  if (!Number.isFinite(serviceId) || serviceId < 1) {
    return NextResponse.json({ error: "serviceId inválido." }, { status: 400 });
  }

  const order = await prisma.order.findUnique({
    where: { id },
    include: {
      items: {
        include: {
          product: {
            select: {
              name: true,
              price: true,
              weightGrams: true,
              lengthCm: true,
              widthCm: true,
              heightCm: true,
            },
          },
        },
      },
    },
  });

  if (!order) {
    return NextResponse.json({ error: "Pedido não encontrado." }, { status: 404 });
  }

  if (!order.paidAt) {
    return NextResponse.json(
      { error: "Não é possível gerar etiqueta para pedido não pago." },
      { status: 400 }
    );
  }

  const destCep = (order.destinationCep ?? "").replace(/\D/g, "");
  if (destCep.length !== 8) {
    return NextResponse.json(
      { error: "CEP de destino do pedido inválido ou não informado." },
      { status: 400 }
    );
  }

  if (!order.addressStreet || !order.addressCity || !order.addressState) {
    return NextResponse.json(
      { error: "Endereço de entrega incompleto no pedido (rua, cidade ou estado ausente)." },
      { status: 400 }
    );
  }

  // Agrega dimensões e peso dos produtos do pedido
  let totalWeightGrams = 0;
  let maxLengthCm = DEFAULT_PKG.lengthCm;
  let maxWidthCm = DEFAULT_PKG.widthCm;
  let maxHeightCm = DEFAULT_PKG.heightCm;
  let totalInsurance = 0;

  const products: LabelInput["products"] = [];

  for (const item of order.items) {
    const p = item.product;
    const qty = item.quantity;
    const unitGrams = (p.weightGrams ?? 0) > 0 ? p.weightGrams! : DEFAULT_PKG.weightGrams;
    totalWeightGrams += unitGrams * qty;
    if ((p.lengthCm ?? 0) > 0) maxLengthCm = Math.max(maxLengthCm, p.lengthCm!);
    if ((p.widthCm ?? 0) > 0) maxWidthCm = Math.max(maxWidthCm, p.widthCm!);
    if ((p.heightCm ?? 0) > 0) maxHeightCm = Math.max(maxHeightCm, p.heightCm!);
    totalInsurance += item.price * qty;
    products.push({
      name: p.name,
      quantity: qty,
      unitary_value: item.price,
      weight: unitGrams / 1000,
    });
  }

  const dims = packageToSuperFreteKgCm({
    weightGrams: totalWeightGrams,
    lengthCm: maxLengthCm,
    widthCm: maxWidthCm,
    heightCm: maxHeightCm,
  });

  const input: LabelInput = {
    serviceId,
    to: {
      name: order.recipientName || order.email.split("@")[0] || "Destinatário",
      phone: order.phone ?? undefined,
      email: order.email,
      address: order.addressStreet!,
      number: order.addressNumber ?? undefined,
      complement: order.addressComplement ?? undefined,
      district: order.addressNeighborhood ?? undefined,
      city: order.addressCity!,
      state_abbr: order.addressState!,
      postal_code: destCep,
    },
    products,
    volume: {
      height: dims.heightCm,
      width: dims.widthCm,
      length: dims.lengthCm,
      weight: dims.weightKg,
    },
    insuranceValue: Math.round(totalInsurance * 100) / 100,
    tag: order.id,
  };

  try {
    const result = await createSuperfreteLabelForOrder(input);

    await prisma.order.update({
      where: { id },
      data: {
        superfreteShipmentId: result.shipmentId,
        labelUrl: result.labelUrl,
        shippingStatus: "packed",
      },
    });

    return NextResponse.json({
      shipmentId: result.shipmentId,
      labelUrl: result.labelUrl,
    });
  } catch (e) {
    if (e instanceof ShippingQuoteError) {
      return NextResponse.json({ error: e.message }, { status: e.status });
    }
    console.error("[POST /api/admin/orders/:id/label]", e);
    return NextResponse.json({ error: "Erro ao gerar etiqueta." }, { status: 500 });
  }
}
