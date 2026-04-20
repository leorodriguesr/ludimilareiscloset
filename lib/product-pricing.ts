/** Percentual de desconto exibido para pagamento via Pix (somente vitrine). */
export const PIX_DISCOUNT_PERCENT = 9;

/** Número de parcelas exibidas na vitrine (sem juros). */
export const SHOWCASE_INSTALLMENTS = 3;

export function priceWithPixDiscount(listPrice: number): number {
  const factor = 1 - PIX_DISCOUNT_PERCENT / 100;
  return Math.round(listPrice * factor * 100) / 100;
}

export function installmentValueEqualParts(
  listPrice: number,
  parts: number
): number {
  if (parts <= 0) return listPrice;
  return Math.round((listPrice / parts) * 100) / 100;
}
