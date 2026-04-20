import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdminApi } from "@/lib/require-admin-api";

export async function GET() {
  let settings = await prisma.storeSettings.findUnique({
    where: { id: "default" },
  });

  if (!settings) {
    settings = await prisma.storeSettings.create({
      data: { id: "default", bannerImageUrl: "" },
    });
  }

  return NextResponse.json(settings);
}

export async function PUT(request: NextRequest) {
  const gate = await requireAdminApi();
  if (gate instanceof NextResponse) return gate;

  const body = await request.json();
  const { bannerImageUrl } = body;

  const settings = await prisma.storeSettings.upsert({
    where: { id: "default" },
    update: { bannerImageUrl: bannerImageUrl ?? "" },
    create: { id: "default", bannerImageUrl: bannerImageUrl ?? "" },
  });

  return NextResponse.json(settings);
}
