import { randomBytes } from "crypto";
import {
  CustomerDataStatus,
  OrderSource,
} from "@/app/generated/prisma/client";
import { customerContactAddressValidationError } from "@/lib/admin-sale/customer-form-complete";
import { getAppBaseUrl } from "@/lib/site-url";

const TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000;

export function generateCustomerDataToken(): {
  token: string;
  expiresAt: Date;
} {
  return {
    token: randomBytes(32).toString("hex"),
    expiresAt: new Date(Date.now() + TOKEN_TTL_MS),
  };
}

export function buildCustomerDataUrl(token: string): string {
  return `${getAppBaseUrl()}/venda-avulsa/completar/${token}`;
}

export async function validateCustomerDataToken(token: string): Promise<
  | { ok: true; orderId: string }
  | { ok: false; error: string }
> {
  const { prisma } = await import("@/lib/prisma");
  const order = await prisma.order.findFirst({
    where: {
      customerDataToken: token,
      orderSource: OrderSource.ADMIN_SALE,
    },
    select: {
      id: true,
      customerDataTokenExpiresAt: true,
      customerDataStatus: true,
    },
  });

  if (!order) {
    return { ok: false, error: "Link inválido ou expirado." };
  }
  if (
    order.customerDataTokenExpiresAt &&
    order.customerDataTokenExpiresAt < new Date()
  ) {
    return { ok: false, error: "Este link expirou. Solicite um novo ao vendedor." };
  }
  if (order.customerDataStatus === CustomerDataStatus.COMPLETE) {
    return { ok: false, error: "Os dados desta venda já foram preenchidos." };
  }

  return { ok: true, orderId: order.id };
}

export type CustomerDataInput = {
  name: string;
  email: string;
  phone: string;
  cpf?: string;
  destinationCep: string;
  addressStreet: string;
  addressNumber: string;
  addressComplement?: string;
  addressNeighborhood: string;
  addressCity: string;
  addressState: string;
};

export async function submitCustomerData(
  token: string,
  data: CustomerDataInput
): Promise<{ ok: true } | { ok: false; error: string }> {
  const validation = await validateCustomerDataToken(token);
  if (!validation.ok) return validation;

  const validationError = customerContactAddressValidationError({
    name: data.name,
    email: data.email,
    phone: data.phone,
    cpf: data.cpf ?? "",
    destinationCep: data.destinationCep,
    street: data.addressStreet,
    number: data.addressNumber,
    complement: data.addressComplement ?? "",
    neighborhood: data.addressNeighborhood,
    city: data.addressCity,
    state: data.addressState,
  });
  if (validationError) {
    return { ok: false, error: validationError };
  }

  const { prisma } = await import("@/lib/prisma");
  const { onOrderPaymentConfirmed } = await import(
    "@/lib/fulfillment/fulfillment-service"
  );
  const { ORDER_STATUS } = await import("@/lib/orders/constants");
  const { normalizePostalCode } = await import("@/lib/shipping/superfrete");

  const cep = normalizePostalCode(data.destinationCep);
  if (!cep) {
    return { ok: false, error: "CEP inválido." };
  }

  const order = await prisma.order.update({
    where: { id: validation.orderId },
    data: {
      recipientName: data.name.trim(),
      email: data.email.trim().toLowerCase(),
      phone: data.phone.trim(),
      cpf: data.cpf?.trim() || null,
      destinationCep: cep,
      addressStreet: data.addressStreet.trim(),
      addressNumber: data.addressNumber.trim(),
      addressComplement: data.addressComplement?.trim() || null,
      addressNeighborhood: data.addressNeighborhood.trim(),
      addressCity: data.addressCity.trim(),
      addressState: data.addressState.trim().toUpperCase().slice(0, 2),
      customerDataStatus: CustomerDataStatus.COMPLETE,
    },
    select: {
      id: true,
      status: true,
      fulfillmentType: true,
      customerDataStatus: true,
      recipientName: true,
      addressStreet: true,
      addressCity: true,
      addressState: true,
      destinationCep: true,
    },
  });

  if (order.status === ORDER_STATUS.PAID) {
    await onOrderPaymentConfirmed(order);
  }

  return { ok: true };
}
