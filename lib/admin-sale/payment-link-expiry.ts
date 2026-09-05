export function isCheckoutPaymentLinkWithinDeadline(input: {
  orderSource: string | null | undefined;
  expiresAt: Date | string | null | undefined;
  now?: Date;
}): boolean {
  if (input.orderSource !== "CHECKOUT") return true;
  if (!input.expiresAt) return false;

  const deadline =
    input.expiresAt instanceof Date
      ? input.expiresAt
      : new Date(input.expiresAt);
  if (!Number.isFinite(deadline.getTime())) return false;

  return deadline > (input.now ?? new Date());
}
