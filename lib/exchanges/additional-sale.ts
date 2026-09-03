import type { ExchangeBalanceStatus } from "@/app/generated/prisma/client";
import { roundMoney } from "@/lib/exchanges/product-diff";

export type OutboundSaleRole = "REPLACEMENT" | "ADDITIONAL_SALE";

export function additionalSaleSnapshot(
  rows: { lineRole?: string | null; quantity: number; lineTotal: number }[]
): { additionalSaleItemCount: number; additionalSaleItemsTotal: number } {
  const extra = rows.filter((row) => row.lineRole === "ADDITIONAL_SALE");
  return {
    additionalSaleItemCount: extra.reduce((acc, row) => acc + row.quantity, 0),
    additionalSaleItemsTotal: roundMoney(
      extra.reduce((acc, row) => acc + row.lineTotal, 0)
    ),
  };
}

export function additionalSaleRecognitionDate(input: {
  additionalSaleItemCount: number;
  balanceStatus: ExchangeBalanceStatus;
  existing?: Date | null;
}): Date | null {
  if (input.additionalSaleItemCount <= 0) return null;
  const settled =
    input.balanceStatus === "NONE" ||
    input.balanceStatus === "PAID" ||
    input.balanceStatus === "WAIVED" ||
    input.balanceStatus === "SETTLED";
  if (!settled) return input.existing ?? null;
  return input.existing ?? new Date();
}
