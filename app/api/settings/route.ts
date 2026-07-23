import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { PERMISSION } from "@/lib/auth/permissions";
import { requirePermission } from "@/lib/auth/require-permission";

const DEFAULT_SETTINGS = {
  id: "default",
  bannerImageUrl: "",
  bannerMobileImageUrl: "",
  freeShippingEnabled: false,
  freeShippingType: "minimum_value",
  freeShippingMinValue: 0,
  packagingDays: 0,
  storeDeliveryFee: 0,
};

export async function GET() {
  let settings = await prisma.storeSettings.findUnique({
    where: { id: "default" },
  });

  if (!settings) {
    settings = await prisma.storeSettings.create({ data: DEFAULT_SETTINGS });
  }

  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const gate = await requirePermission(PERMISSION.SETTINGS_MANAGE);
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  const {
    bannerImageUrl,
    bannerMobileImageUrl,
    freeShippingEnabled,
    freeShippingType,
    freeShippingMinValue,
    packagingDays,
    storeDeliveryFee,
  } = body;

  const settings = await prisma.storeSettings.upsert({
    where: { id: "default" },
    update: {
      ...(bannerImageUrl !== undefined && { bannerImageUrl: bannerImageUrl ?? "" }),
      ...(bannerMobileImageUrl !== undefined && {
        bannerMobileImageUrl: bannerMobileImageUrl ?? "",
      }),
      ...(freeShippingEnabled !== undefined && { freeShippingEnabled: Boolean(freeShippingEnabled) }),
      ...(freeShippingType !== undefined && { freeShippingType: freeShippingType ?? "minimum_value" }),
      ...(freeShippingMinValue !== undefined && { freeShippingMinValue: Number(freeShippingMinValue) ?? 0 }),
      ...(packagingDays !== undefined && { packagingDays: Math.max(0, Math.floor(Number(packagingDays) || 0)) }),
      ...(storeDeliveryFee !== undefined && {
        storeDeliveryFee: Math.max(0, Math.round((Number(storeDeliveryFee) || 0) * 100) / 100),
      }),
    },
    create: DEFAULT_SETTINGS,
  });

  return NextResponse.json(settings);
}
