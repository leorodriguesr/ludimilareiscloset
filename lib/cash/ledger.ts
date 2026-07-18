import type {
  CashLedgerDirection,
  CashLedgerKind,
  Prisma,
} from "@/app/generated/prisma/client";

export type CashLedgerTx = Prisma.TransactionClient;

export async function appendCashLedgerEntry(
  tx: CashLedgerTx,
  input: {
    direction: CashLedgerDirection;
    kind: CashLedgerKind;
    amount: number;
    description: string;
    orderId?: string | null;
    exchangeId?: string | null;
    paymentAttemptId?: string | null;
    actorUserId?: string | null;
  }
) {
  const amount = Math.round(Math.abs(input.amount) * 100) / 100;
  if (amount < 0.01) return null;

  return tx.cashLedgerEntry.create({
    data: {
      direction: input.direction,
      kind: input.kind,
      amount,
      description: input.description.slice(0, 500),
      orderId: input.orderId ?? null,
      exchangeId: input.exchangeId ?? null,
      paymentAttemptId: input.paymentAttemptId ?? null,
      actorUserId: input.actorUserId ?? null,
    },
  });
}
