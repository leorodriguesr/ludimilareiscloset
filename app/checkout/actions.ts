"use server";

import { getAppSession } from "@/lib/auth-session";
import { prisma } from "@/lib/prisma";
import {
  createOrderFromCheckout,
  OrderCreateError,
  type CheckoutLineInput,
} from "@/lib/orders/create-order";

export type PlaceOrderState =
  | { ok: true; orderId: string }
  | { ok: false; error: string };

export async function placeOrderAction(input: {
  /** Obrigatório para guest; logado pode omitir (usa e-mail da conta). */
  email?: string;
  lines: CheckoutLineInput[];
}): Promise<PlaceOrderState> {
  const session = await getAppSession();
  let userId: string | null = session.user?.userId ?? null;
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
    });
    return { ok: true, orderId: order.id };
  } catch (e) {
    if (e instanceof OrderCreateError) {
      return { ok: false, error: e.message };
    }
    console.error("[placeOrderAction]", e);
    return { ok: false, error: "Não foi possível criar o pedido." };
  }
}
