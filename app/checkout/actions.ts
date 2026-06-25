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
import { createPixPayment } from "@/lib/payments/create-pix-payment";

export type PlaceOrderState =
  | { ok: true; type: "card"; orderId: string; checkoutUrl: string }
  | {
      ok: true;
      type: "pix";
      orderId: string;
      pixCode: string;
      pixQrBase64: string | null;
      expiresAt: string;
      amount: number;
    }
  | { ok: false; error: string };

/** Atualiza nome, telefone e CPF do usuário logado no checkout. */
export async function updateUserCheckoutContactAction(input: {
  name: string;
  phone: string;
  cpf: string;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const session = await getAppSession();
  if (!session.user) return { ok: false, error: "Não autenticado." };

  const name = input.name.trim();
  const phoneDigits = input.phone.replace(/\D/g, "");
  const cpfDigits = input.cpf.replace(/\D/g, "");

  if (!name) return { ok: false, error: "Informe seu nome." };
  if (phoneDigits.length < 10) return { ok: false, error: "Informe um telefone válido com DDD." };
  if (cpfDigits.length !== 11) return { ok: false, error: "Informe um CPF válido (11 dígitos)." };

  await prisma.user.update({
    where: { id: session.user.userId },
    data: { name, phone: phoneDigits, cpf: cpfDigits },
  });
  return { ok: true };
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
  paymentMethod: "pix" | "card";
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
      paymentMethod: input.paymentMethod,
    });

    // ── PIX via Mercado Pago ──────────────────────────────────────────────────
    if (input.paymentMethod === "pix") {
      const payerName =
        input.contact?.name?.trim() ||
        (session.user
          ? (
              await prisma.user.findUnique({
                where: { id: session.user.userId },
                select: { name: true },
              })
            )?.name
          : undefined) ||
        guestDisplayName(email);

      try {
        const pix = await createPixPayment({
          orderId: order.id,
          amount: order.total,
          description: `Pedido Ludimila Reis Closet`,
          payerEmail: email,
          payerName,
          payerCpf: input.cpf,
        });

        // Guarda o ID da Order do Mercado Pago para polling/webhook
        await prisma.order.update({
          where: { id: order.id },
          data: { mercadoPagoPaymentId: pix.mpOrderId },
        });

        return {
          ok: true,
          type: "pix",
          orderId: order.id,
          pixCode: pix.pixCode,
          pixQrBase64: pix.pixQrBase64,
          expiresAt: pix.expiresAt,
          amount: order.total,
        };
      } catch (e) {
        console.error("[placeOrderAction] Mercado Pago PIX", e);
        const msg =
          e instanceof Error ? e.message : "Não foi possível gerar o PIX.";
        if (msg.includes("MERCADO_PAGO_ACCESS_TOKEN")) {
          return {
            ok: false,
            error: "Pagamento PIX não configurado no servidor.",
          };
        }
        return { ok: false, error: msg };
      }
    }

    // ── Cartão via InfinitePay ────────────────────────────────────────────────
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

    const checkoutPhone = input.contact?.phone
      ? normalizePhone(input.contact.phone)
      : undefined;

    if (session.user) {
      const u = await prisma.user.findUnique({
        where: { id: session.user.userId },
        select: { name: true, phone: true },
      });
      const phone = checkoutPhone ?? (u ? normalizePhone(u.phone) : undefined);
      const name = (
        input.contact?.name?.trim() || u?.name || guestDisplayName(email)
      ).slice(0, 120);
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
        "[placeOrderAction] retorno e webhook usam base URL local. A InfinitePay não alcança webhooks em localhost."
      );
    }

    try {
      const { checkoutUrl, slug: invoiceSlug } =
        await createInfinitePayCheckoutLink({
          items,
          orderNsu: full.id,
          redirectUrl: infinitePayOrderRedirectUrl(full.id),
          webhookUrl: infinitePayWebhookUrl(),
          customer,
          ...(destDigits.length === 8
            ? {
                address: {
                  cep: destDigits,
                  ...(input.address?.street
                    ? { street: input.address.street }
                    : {}),
                  ...(input.address?.number
                    ? { number: input.address.number }
                    : {}),
                  ...(input.address?.complement
                    ? { complement: input.address.complement }
                    : {}),
                  ...(input.address?.neighborhood
                    ? { neighborhood: input.address.neighborhood }
                    : {}),
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
      return {
        ok: true,
        type: "card",
        orderId: full.id,
        checkoutUrl,
      };
    } catch (e) {
      console.error("[placeOrderAction] InfinitePay", e);
      const msg =
        e instanceof Error
          ? e.message
          : "Não foi possível iniciar o pagamento.";
      if (msg.includes("INFINITEPAY_HANDLE")) {
        return {
          ok: false,
          error: "Pagamento não configurado no servidor (INFINITEPAY_HANDLE).",
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
