import type {
  ExchangeBalanceStatus,
  ExchangeShippingPaidBy,
} from "@/app/generated/prisma/client";

export type BalanceShippingInput = {
  quotedPrice: number | null | undefined;
  paidBy: ExchangeShippingPaidBy;
};

export type ComputedExchangeBalance = {
  returnedItemsTotal: number;
  newItemsTotal: number;
  productsDelta: number;
  shippingCustomerTotal: number;
  balanceAmount: number;
  balanceStatus: ExchangeBalanceStatus;
};

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

export function computeExchangeBalance(input: {
  returnedItemsTotal: number;
  newItemsTotal: number;
  shippings: BalanceShippingInput[];
}): ComputedExchangeBalance {
  const returnedItemsTotal = roundMoney(input.returnedItemsTotal);
  const newItemsTotal = roundMoney(input.newItemsTotal);
  const productsDelta = roundMoney(newItemsTotal - returnedItemsTotal);

  const shippingCustomerTotal = roundMoney(
    input.shippings.reduce((acc, s) => {
      if (s.paidBy !== "CUSTOMER") return acc;
      const price = Number(s.quotedPrice ?? 0);
      return acc + (Number.isFinite(price) && price > 0 ? price : 0);
    }, 0)
  );

  const balanceAmount = roundMoney(productsDelta + shippingCustomerTotal);

  let balanceStatus: ExchangeBalanceStatus = "NONE";
  if (balanceAmount > 0.009) balanceStatus = "PENDING";
  else if (balanceAmount < -0.009) balanceStatus = "CREDIT_PENDING";

  return {
    returnedItemsTotal,
    newItemsTotal,
    productsDelta,
    shippingCustomerTotal,
    balanceAmount,
    balanceStatus,
  };
}
