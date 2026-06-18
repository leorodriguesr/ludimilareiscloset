"use server";

import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import {
  createOrderFromCheckout,
  OrderCreateError,
  type CheckoutLineInput,
  type OrderContactInput,
  type OrderAddressInput,
} from "@/lib/orders/create-order";
import {
  createInfinitePayCheckoutLink,
  infinitePayOrderRedirectUrl,
  infinitePayWebhookUrl,
} from "@/lib/payments/infinitepay";
import { orderToInfinitePayItems } from "@/lib/payments/order-to-infinitepay-items";
import { isLocalPaymentCallbackBaseUrl } from "@/lib/site-url";

export type PlaceOrderState =
  | { ok: true; orderId: string; checkoutUrl: string }
  | { ok: false; error: string };

/** Atualiza o telefone do usuário logado caso esteja vazio ou inválido. */
export async function updateUserPhoneAction(phone: string): Promise<void> {
  const session = await getAppSession();
  if (!session.user) return;
  const digits = phone.replace(/\D/g, "");
  if (digits.length < 10) return;
  await prisma.user.update({
    where: { id: session.user.userId },
    data: { phone: digits },
  });
}

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

export async function placeOrderAction(input: {
  /** Obrigatório para guest; logado pode omitir (usa e-mail da conta). */
  email?: string;
  lines: CheckoutLineInput[];
  shipping: { destinationCep: string; optionId: string };
  contact?: OrderContactInput;
  address?: OrderAddressInput;
  cpf?: string;
}): Promise<PlaceOrderState> {
  const session = await getAppSession();
  const userId: string | null = session.user?.userId ?? null;
  let email = (input.email ?? "").trim().toLowerCase();

  if (session.user) {
    const row = await prisma.user.findUnique({
      where: { id: session.user.userId },
      select: { email: true },
    });
    if (row?.email) {
      email = row.email.trim().toLowerCase();
    }
  }

  if (!email) {
    return { ok: false, error: "Informe um e-mail para continuar." };
  }

  try {
    const order = await createOrderFromCheckout({
      email,
      userId,
      lines: input.lines,
      shipping: input.shipping,
      contact: {
        ...input.contact,
        cpf: input.cpf ?? undefined,
      },
      address: input.address,
    });

    const full = await prisma.order.findUnique({
      where: { id: order.id },
      include: {
        items: { include: { product: { select: { name: true } } } },
      },
    });

    if (!full) {
      return { ok: false, error: "Pedido criado mas não encontrado." };
    }

    let items;
    try {
      items = orderToInfinitePayItems(full);
    } catch (e) {
      console.error("[placeOrderAction] itens InfinitePay", e);
      return {
        ok: false,
        error: "Erro ao montar o pagamento. Entre em contato com o suporte.",
      };
    }

    let customer: {
      name: string;
      email: string;
      phone_number?: string;
    };

    // Telefone: preferência → coletado no checkout → User.phone (logado) → nenhum
    const checkoutPhone = input.contact?.phone
      ? normalizePhone(input.contact.phone)
      : undefined;

    if (session.user) {
      const u = await prisma.user.findUnique({
        where: { id: session.user.userId },
        select: { name: true, phone: true },
      });
      const phone = checkoutPhone ?? (u ? normalizePhone(u.phone) : undefined);
      const name =
        (input.contact?.name?.trim() || u?.name || guestDisplayName(email)).slice(0, 120);
      customer = { name, email, ...(phone ? { phone_number: phone } : {}) };
    } else {
      const name = (
        input.contact?.name?.trim() || guestDisplayName(email)
      ).slice(0, 120);
      customer = {
        name,
        email,
        ...(checkoutPhone ? { phone_number: checkoutPhone } : {}),
      };
    }

    const destDigits = (full.destinationCep ?? "").replace(/\D/g, "");

    if (isLocalPaymentCallbackBaseUrl()) {
      console.warn(
        "[placeOrderAction] retorno e webhook usam base URL local. A InfinitePay não alcança webhooks em localhost. Defina PAYMENT_CALLBACK_BASE_URL ou NEXT_PUBLIC_SITE_URL com origem pública (https), ex. domínio em produção ou túnel ngrok em dev."
      );
    }

    try {
      const { checkoutUrl, slug: invoiceSlug } = await createInfinitePayCheckoutLink({
        items,
        orderNsu: full.id,
        redirectUrl: infinitePayOrderRedirectUrl(full.id),
        webhookUrl: infinitePayWebhookUrl(),
        customer,
        ...(destDigits.length === 8
          ? {
              address: {
                cep: destDigits,
                ...(input.address?.street ? { street: input.address.street } : {}),
                ...(input.address?.number ? { number: input.address.number } : {}),
                ...(input.address?.complement ? { complement: input.address.complement } : {}),
                ...(input.address?.neighborhood ? { neighborhood: input.address.neighborhood } : {}),
              },
            }
          : {}),
      });
      if (invoiceSlug) {
        await prisma.order.update({
          where: { id: full.id },
          data: { infinitePayInvoiceSlug: invoiceSlug },
        });
      }
      return { ok: true, orderId: full.id, checkoutUrl };
    } catch (e) {
      console.error("[placeOrderAction] InfinitePay", e);
      const msg =
        e instanceof Error
          ? e.message
          : "Não foi possível iniciar o pagamento.";
      if (msg.includes("INFINITEPAY_HANDLE")) {
        return {
          ok: false,
          error:
            "Pagamento não configurado no servidor (INFINITEPAY_HANDLE).",
        };
      }
      return { ok: false, error: msg };
    }
  } catch (e) {
    if (e instanceof OrderCreateError) {
      return { ok: false, error: e.message };
    }
    console.error("[placeOrderAction]", e);
    return { ok: false, error: "Não foi possível criar o pedido." };
  }
}
