import { NextRequest, NextResponse } from "next/server";
import { submitCustomerData } from "@/lib/admin-sale/complete-customer-data";

type RouteContext = { params: Promise<{ token: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const { token } = await context.params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const b = body as Record<string, unknown>;
  const result = await submitCustomerData(token, {
    name: String(b.name ?? ""),
    email: String(b.email ?? ""),
    phone: String(b.phone ?? ""),
    cpf: typeof b.cpf === "string" ? b.cpf : undefined,
    destinationCep: String(b.destinationCep ?? ""),
    addressStreet: String(b.addressStreet ?? ""),
    addressNumber: String(b.addressNumber ?? ""),
    addressComplement:
      typeof b.addressComplement === "string" ? b.addressComplement : undefined,
    addressNeighborhood: String(b.addressNeighborhood ?? ""),
    addressCity: String(b.addressCity ?? ""),
    addressState: String(b.addressState ?? ""),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
