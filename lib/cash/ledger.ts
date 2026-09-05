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
    idempotencyKey?: string | null;
  }
) {
  const amount = Math.round(Math.abs(input.amount) * 100) / 100;
  if (amount < 0.01) return null;

  const idempotencyKey = input.idempotencyKey?.trim() || null;
  if (idempotencyKey) {
    const existing = await tx.cashLedgerEntry.findUnique({
      where: { idempotencyKey },
    });
    if (existing) return existing;
  }

  try {
    return await tx.cashLedgerEntry.create({
      data: {
        direction: input.direction,
        kind: input.kind,
        amount,
        description: input.description.slice(0, 500),
        orderId: input.orderId ?? null,
        exchangeId: input.exchangeId ?? null,
        paymentAttemptId: input.paymentAttemptId ?? null,
        actorUserId: input.actorUserId ?? null,
        idempotencyKey,
      },
    });
  } catch (error) {
    if (idempotencyKey && isUniqueConstraintError(error)) {
      return tx.cashLedgerEntry.findUnique({
        where: { idempotencyKey },
      });
    }
    throw error;
  }
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error != null &&
    "code" in error &&
    (error as { code?: string }).code === "P2002"
  );
}
