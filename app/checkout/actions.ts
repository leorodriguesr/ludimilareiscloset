"use server";

import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import type {
  CheckoutLineInput,
  OrderAddressInput,
  OrderContactInput,
} from "@/lib/orders/create-order";
import { OrderCreateError } from "@/lib/orders/create-order";
import {
  startCheckoutPayment,
  type StartCheckoutPaymentSuccess,
} from "@/lib/orders/start-checkout-payment";
import { cpfDigits, cpfValidationError } from "@/lib/validation/cpf";

export type PlaceOrderState =
  | StartCheckoutPaymentSuccess
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
  const cpf = cpfDigits(input.cpf);
  const cpfError = cpfValidationError(cpf);

  if (!name) return { ok: false, error: "Informe seu nome." };
  if (phoneDigits.length < 10) {
    return { ok: false, error: "Informe um telefone válido com DDD." };
  }
  if (cpfError) return { ok: false, error: cpfError };

  await prisma.user.update({
    where: { id: session.user.userId },
    data: { name, phone: phoneDigits, cpf },
  });
  return { ok: true };
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

  const cpf = input.cpf ? cpfDigits(input.cpf) : "";
  const cpfError = cpfValidationError(cpf);
  if (cpfError) return { ok: false, error: cpfError };

  try {
    return await startCheckoutPayment({
      email,
      userId,
      lines: input.lines,
      shipping: input.shipping,
      contact: {
        ...input.contact,
        cpf,
      },
      address: input.address,
      cpf,
      paymentMethod: input.paymentMethod,
    });
  } catch (e) {
    if (e instanceof OrderCreateError) {
      return { ok: false, error: e.message };
    }
    console.error("[placeOrderAction]", e);
    return { ok: false, error: "Não foi possível processar o pedido." };
  }
}
