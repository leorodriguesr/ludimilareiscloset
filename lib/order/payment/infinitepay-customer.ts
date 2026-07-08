import { CustomerDataStatus } from "@/app/generated/prisma/client";
import type { CreateInfinitePayLinkInput } from "@/lib/payments/infinitepay";

function guestDisplayName(email: string): string {
  const local = email.split("@")[0]?.trim();
  if (local && local.length > 0) return local.slice(0, 80);
  return "Cliente";
}

function normalizePhone(phone: string): string | undefined {
  const d = phone.replace(/\D/g, "");
  if (d.length < 10) return undefined;
  if (d.startsWith("55")) return `+${d}`;
  return `+55${d}`;
}

/** Dados do comprador no checkout InfinitePay. Omitido quando o cliente ainda vai preencher os dados. */
export function buildInfinitePayCustomer(order: {
  customerDataStatus?: CustomerDataStatus | null;
  recipientName?: string | null;
  email: string;
  phone?: string | null;
}): NonNullable<CreateInfinitePayLinkInput["customer"]> | undefined {
  if (order.customerDataStatus === CustomerDataStatus.PENDING) {
    return undefined;
  }

  const phone = order.phone ? normalizePhone(order.phone) : undefined;
  return {
    name: (order.recipientName ?? guestDisplayName(order.email)).slice(0, 120),
    email: order.email,
    ...(phone ? { phone_number: phone } : {}),
  };
}
