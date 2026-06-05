import { prisma } from "@/lib/prisma";

/**
 * Associa pedidos feitos como visitante (sem `userId`) à conta do usuário,
 * casando pelo e-mail. Chamado quando o usuário se cadastra ou faz login, para
 * que compras feitas antes de ter conta apareçam em "Minha conta".
 *
 * Só toca pedidos órfãos (`userId = null`), nunca pedidos já vinculados a outra
 * conta. Retorna quantos pedidos foram reivindicados.
 */
export async function claimGuestOrders(
  userId: string,
  email: string
): Promise<number> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return 0;

  const result = await prisma.order.updateMany({
    where: { email: normalized, userId: null },
    data: { userId },
  });
  return result.count;
}
